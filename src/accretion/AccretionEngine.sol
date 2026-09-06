// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {AccretiveIndex} from "../core/AccretiveIndex.sol";
import {IndexFactory} from "../core/IndexFactory.sol";
import {IUniswapV4SwapAdapter} from "../periphery/interfaces/IUniswapV4SwapAdapter.sol";
import {NavLib} from "../libs/NavLib.sol";
import {AggregatorV3Interface} from "../testnet/MockPriceFeed.sol";

/**
 * @title AccretionEngine
 * @notice One clone per index. Holds swept USDC; permissionless harvest buys at launch weights,
 *         then worst-leg-recognizes into the vault via depositAccretion (ZERO shares minted).
 *
 * @dev Harvest spend uses fixed `launchWeightsBps` (e.g. 50/50), NOT live value-weights.
 *      Leftover constituent tokens and leftover USDC remain in this engine.
 *      On successful recognition, engine prices `recognized` via factory feeds + NavLib and
 *      passes usdWadIncrement into depositAccretion (display only; does not invent a fee path).
 *      Assumption: non-positive / missing feeds revert harvest (stale feeds MAY block harvest per spec).
 */
contract AccretionEngine is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint16 public constant MAX_BPS = 10_000;
    uint256 internal constant WAD = 1e18;

    AccretiveIndex public index;
    address public factory;
    IERC20 public usdc;
    IUniswapV4SwapAdapter public swapAdapter;

    uint16[] internal _launchWeightsBps;

    error ZeroAddress();
    error OnlyFactory();
    error LengthMismatch();
    error InvalidWeights();
    error DeadlineExpired();
    error NoUsdc();
    error NothingRecognized();
    error MissingPriceFeed(address asset);

    event Harvested(
        address indexed caller, uint256 usdcSpent, uint256[] bought, uint256[] recognized, uint256 usdcRemaining
    );
    event SwapAdapterUpdated(address indexed adapter);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize engine clone: link to index, USDC, adapter, and immutable launch weights.
     * @param index_ AccretiveIndex clone (already or about to be initialized with this engine).
     * @param factory_ IndexFactory that created this pair.
     * @param usdc_ USDC token (6 decimals on Base).
     * @param swapAdapter_ Exact-in adapter (may be address(0) until set; harvest requires non-zero).
     * @param launchWeightsBps_ MUST match createIndex weights; sum to 10_000; length == constituents.
     */
    function initialize(
        address index_,
        address factory_,
        address usdc_,
        address swapAdapter_,
        uint16[] memory launchWeightsBps_
    ) external initializer {
        if (index_ == address(0) || factory_ == address(0) || usdc_ == address(0)) {
            revert ZeroAddress();
        }

        address[] memory cons = AccretiveIndex(index_).constituents();
        uint256 n = cons.length;
        if (launchWeightsBps_.length != n) revert LengthMismatch();

        uint256 sum;
        for (uint256 i = 0; i < n; ++i) {
            sum += launchWeightsBps_[i];
            _launchWeightsBps.push(launchWeightsBps_[i]);
        }
        if (sum != MAX_BPS) revert InvalidWeights();

        index = AccretiveIndex(index_);
        factory = factory_;
        usdc = IERC20(usdc_);
        swapAdapter = IUniswapV4SwapAdapter(swapAdapter_);
    }

    function launchWeightsBps() external view returns (uint16[] memory) {
        return _launchWeightsBps;
    }

    /// @notice Factory MAY update adapter after deploy (full adapter ships later).
    function setSwapAdapter(address adapter_) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (adapter_ == address(0)) revert ZeroAddress();
        swapAdapter = IUniswapV4SwapAdapter(adapter_);
        emit SwapAdapterUpdated(adapter_);
    }

    /**
     * @notice Permissionless harvest: split engine USDC by launch weights, buy each leg,
     *         depositAccretion worst-leg basket proportional to current tracked. Mints zero shares.
     * @param minOut Per-leg minimum token out (slippage).
     * @param deadline Swap deadline (unix seconds).
     * @return recognized Amounts deposited into the index.
     */
    function harvest(uint256[] calldata minOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256[] memory recognized)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (address(swapAdapter) == address(0)) revert ZeroAddress();

        address[] memory cons = index.constituents();
        uint256 n = cons.length;
        if (minOut.length != n) revert LengthMismatch();

        uint256 engineUsdc = usdc.balanceOf(address(this));
        if (engineUsdc == 0) revert NoUsdc();

        // Pull-and-swap each leg. Dust from floor(mulDiv) stays as leftover USDC.
        uint256[] memory bought = new uint256[](n);
        uint256 usdcAllocated;
        for (uint256 i = 0; i < n; ++i) {
            uint256 usdcFor = Math.mulDiv(engineUsdc, uint256(_launchWeightsBps[i]), uint256(MAX_BPS));
            if (usdcFor == 0) continue;
            usdcAllocated += usdcFor;
            usdc.forceApprove(address(swapAdapter), usdcFor);
            bought[i] = swapAdapter.swapExactInput(address(usdc), cons[i], usdcFor, minOut[i], deadline);
        }
        usdc.forceApprove(address(swapAdapter), 0);

        recognized = _worstLegRecognize(cons, bought);

        uint256 recognizedSum;
        for (uint256 i = 0; i < n; ++i) {
            recognizedSum += recognized[i];
        }
        if (recognizedSum == 0) revert NothingRecognized();

        for (uint256 i = 0; i < n; ++i) {
            if (recognized[i] > 0) {
                IERC20(cons[i]).forceApprove(address(index), recognized[i]);
            }
        }
        uint256 usdWad = _usdWadForAmounts(cons, recognized);
        index.depositAccretion(recognized, usdWad);
        for (uint256 i = 0; i < n; ++i) {
            if (recognized[i] > 0) {
                IERC20(cons[i]).forceApprove(address(index), 0);
            }
        }

        emit Harvested(msg.sender, usdcAllocated, bought, recognized, usdc.balanceOf(address(this)));
    }

    /**
     * @dev Sum NavLib.usdValueWad over recognized legs using IndexFactory price feeds (8-dec answers).
     *      Constituent amount decimals are 18 (INDEX constituents). Missing/non-positive feed reverts.
     */
    function _usdWadForAmounts(address[] memory cons, uint256[] memory amounts) internal view returns (uint256 usdWad) {
        uint256 n = cons.length;
        int256[] memory answers = new int256[](n);
        IndexFactory fac = IndexFactory(factory);
        for (uint256 i = 0; i < n; ++i) {
            address feed = fac.priceFeedOf(cons[i]);
            if (feed == address(0)) revert MissingPriceFeed(cons[i]);
            (, int256 answer,,,) = AggregatorV3Interface(feed).latestRoundData();
            answers[i] = answer;
        }
        // amountDecimals=18, feedDecimals=8 — matches MockPriceFeed / spec §5
        return NavLib.navWad(amounts, 18, answers, 8);
    }

    /**
     * @dev Largest scale s (WAD) s.t. floor(tracked[i] * s / WAD) <= bought[i] for all i with tracked[i] > 0.
     *      Equivalent: s = min_i (bought[i] * WAD / tracked[i]); recognized[i] = tracked[i] * s / WAD.
     */
    function _worstLegRecognize(address[] memory cons, uint256[] memory bought)
        internal
        view
        returns (uint256[] memory recognized)
    {
        uint256 n = cons.length;
        recognized = new uint256[](n);

        uint256 minScale = type(uint256).max;
        bool any = false;
        for (uint256 i = 0; i < n; ++i) {
            uint256 tracked = index.trackedBalance(cons[i]);
            if (tracked == 0) continue;
            any = true;
            uint256 scale = Math.mulDiv(bought[i], WAD, tracked);
            if (scale < minScale) minScale = scale;
        }
        if (!any || minScale == 0 || minScale == type(uint256).max) {
            return recognized;
        }

        for (uint256 i = 0; i < n; ++i) {
            uint256 tracked = index.trackedBalance(cons[i]);
            if (tracked == 0) {
                recognized[i] = 0;
                continue;
            }
            uint256 r = Math.mulDiv(tracked, minScale, WAD);
            // Guard floating dust: never exceed bought.
            if (r > bought[i]) r = bought[i];
            recognized[i] = r;
        }
    }
}
