// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {AccretiveIndex} from "../core/AccretiveIndex.sol";
import {IndexFactory} from "../core/IndexFactory.sol";
import {IUniswapV4SwapAdapter} from "./interfaces/IUniswapV4SwapAdapter.sol";

/**
 * @title IndexZapRouter
 * @notice USDC convenience router: buyTargetBasket, mintExactSharesWithUSDC, redeemToUSDC.
 * @dev Primary solvency path remains in-kind `AccretiveIndex.redeem` (constituent tokens out).
 *      `redeemToUSDC` is secondary convenience and may incur swap slippage.
 *
 *      `buyTargetBasket` / `buyTargetBasketFor` are used by IndexLauncher.createSeed.
 *      AccretionEngine harvest calls the adapter directly (same allowlist).
 */
contract IndexZapRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint16 public constant MAX_BPS = 10_000;

    IndexFactory public immutable factory;
    IERC20 public immutable usdc;
    IUniswapV4SwapAdapter public swapAdapter;

    address public owner;

    error ZeroAddress();
    error OnlyOwner();
    error DeadlineExpired();
    error LengthMismatch();
    error InvalidWeights();
    error NotIndex();
    error InsufficientBasketForMint();
    error InsufficientUsdcOut();
    error ZeroAmount();

    event OwnerUpdated(address indexed owner);
    event SwapAdapterUpdated(address indexed adapter);
    event BasketBought(address indexed caller, address indexed recipient, uint256 usdcIn, uint256[] amountsOut);
    event MintedWithUSDC(
        address indexed caller, address indexed index, uint256 grossShares, uint256 usdcSpent, uint256 userShares
    );
    event RedeemedToUSDC(address indexed caller, address indexed index, uint256 sharesIn, uint256 usdcOut);

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(IndexFactory factory_, address usdc_, address swapAdapter_, address owner_) {
        if (address(factory_) == address(0) || usdc_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        factory = factory_;
        usdc = IERC20(usdc_);
        swapAdapter = IUniswapV4SwapAdapter(swapAdapter_);
        owner = owner_;
    }

    function setOwner(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnerUpdated(owner_);
    }

    function setSwapAdapter(address adapter_) external onlyOwner {
        if (adapter_ == address(0)) revert ZeroAddress();
        swapAdapter = IUniswapV4SwapAdapter(adapter_);
        emit SwapAdapterUpdated(adapter_);
    }

    /**
     * @notice Split `usdcIn` by `weightsBps`, swap each leg USDC → constituent; send tokens to caller.
     */
    function buyTargetBasket(
        address[] calldata constituents,
        uint16[] calldata weightsBps,
        uint256 usdcIn,
        uint256[] calldata minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256[] memory amountsOut) {
        amountsOut = _buy(msg.sender, msg.sender, constituents, weightsBps, usdcIn, minOut, deadline);
        _refundUsdc(msg.sender);
    }

    /**
     * @notice Launcher entry: pull USDC from `payer`, buy basket, send constituents to `recipient`.
     */
    function buyTargetBasketFor(
        address payer,
        address recipient,
        address[] calldata constituents,
        uint16[] calldata weightsBps,
        uint256 usdcIn,
        uint256[] calldata minOut,
        uint256 deadline
    ) external nonReentrant returns (uint256[] memory amountsOut) {
        if (msg.sender != factory.launcher() && msg.sender != owner) revert OnlyOwner();
        if (recipient == address(0) || payer == address(0)) revert ZeroAddress();
        amountsOut = _buy(payer, recipient, constituents, weightsBps, usdcIn, minOut, deadline);
        // Dust USDC stays with payer refund path: return to payer
        _refundUsdc(payer);
    }

    /**
     * @notice Zap mint: buy constituents with USDC, then mintExactShares. Refund leftovers.
     */
    function mintExactSharesWithUSDC(address index, uint256 desiredGrossShares, uint256 maxUSDC, uint256 deadline)
        external
        nonReentrant
        returns (uint256 userShares, uint256 feeShares, uint256 usdcSpent)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!factory.isIndex(index)) revert NotIndex();
        if (desiredGrossShares == 0 || maxUSDC == 0) revert ZeroAmount();
        if (address(swapAdapter) == address(0)) revert ZeroAddress();

        usdc.safeTransferFrom(msg.sender, address(this), maxUSDC);
        _buyRequiredForMint(index, desiredGrossShares, maxUSDC, deadline);
        (userShares, feeShares) = AccretiveIndex(index).mintExactShares(desiredGrossShares, msg.sender);

        usdcSpent = maxUSDC - usdc.balanceOf(address(this));
        _refundTokens(AccretiveIndex(index).constituents(), msg.sender);
        emit MintedWithUSDC(msg.sender, index, desiredGrossShares, usdcSpent, userShares);
    }

    function _buyRequiredForMint(address index, uint256 desiredGrossShares, uint256 maxUSDC, uint256 deadline)
        internal
    {
        AccretiveIndex idx = AccretiveIndex(index);
        (uint256[] memory required,,) = idx.previewMint(desiredGrossShares);
        address[] memory cons = idx.constituents();
        uint256 n = cons.length;
        uint256 perLeg = maxUSDC / n;
        IUniswapV4SwapAdapter adapter_ = swapAdapter;

        for (uint256 i = 0; i < n; ++i) {
            if (perLeg == 0 || required[i] == 0) continue;
            usdc.forceApprove(address(adapter_), perLeg);
            if (adapter_.swapExactInput(address(usdc), cons[i], perLeg, 0, deadline) < required[i]) {
                usdc.forceApprove(address(adapter_), 0);
                _refundTokens(cons, msg.sender);
                revert InsufficientBasketForMint();
            }
        }
        usdc.forceApprove(address(adapter_), 0);

        for (uint256 i = 0; i < n; ++i) {
            if (required[i] > 0) IERC20(cons[i]).forceApprove(index, required[i]);
        }
    }

    /**
     * @notice Secondary: redeem in-kind to this router, sell constituents for USDC.
     * @dev In-kind `AccretiveIndex.redeem` remains the primary solvency path.
     */
    function redeemToUSDC(address index, uint256 sharesIn, uint256 minUsdcOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 usdcOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!factory.isIndex(index)) revert NotIndex();
        if (sharesIn == 0) revert ZeroAmount();
        if (address(swapAdapter) == address(0)) revert ZeroAddress();

        AccretiveIndex idx = AccretiveIndex(index);
        IERC20(index).safeTransferFrom(msg.sender, address(this), sharesIn);
        uint256[] memory assetOut = idx.redeem(sharesIn, address(this));
        address[] memory cons = idx.constituents();

        uint256 before_ = usdc.balanceOf(address(this));
        for (uint256 i = 0; i < cons.length; ++i) {
            if (assetOut[i] == 0) continue;
            IERC20(cons[i]).forceApprove(address(swapAdapter), assetOut[i]);
            swapAdapter.swapExactInput(cons[i], address(usdc), assetOut[i], 0, deadline);
            IERC20(cons[i]).forceApprove(address(swapAdapter), 0);
        }
        usdcOut = usdc.balanceOf(address(this)) - before_;
        if (usdcOut < minUsdcOut) revert InsufficientUsdcOut();
        usdc.safeTransfer(msg.sender, usdcOut);
        emit RedeemedToUSDC(msg.sender, index, sharesIn, usdcOut);
    }

    function _buy(
        address payer,
        address recipient,
        address[] calldata constituents,
        uint16[] calldata weightsBps,
        uint256 usdcIn,
        uint256[] calldata minOut,
        uint256 deadline
    ) internal returns (uint256[] memory amountsOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (address(swapAdapter) == address(0)) revert ZeroAddress();
        uint256 n = constituents.length;
        if (n == 0 || weightsBps.length != n || minOut.length != n) revert LengthMismatch();
        if (usdcIn == 0) revert ZeroAmount();

        uint256 sum;
        for (uint256 i = 0; i < n; ++i) {
            sum += weightsBps[i];
        }
        if (sum != MAX_BPS) revert InvalidWeights();

        usdc.safeTransferFrom(payer, address(this), usdcIn);

        amountsOut = new uint256[](n);
        for (uint256 i = 0; i < n; ++i) {
            uint256 usdcFor = Math.mulDiv(usdcIn, uint256(weightsBps[i]), uint256(MAX_BPS));
            if (usdcFor == 0) continue;
            usdc.forceApprove(address(swapAdapter), usdcFor);
            amountsOut[i] = swapAdapter.swapExactInput(address(usdc), constituents[i], usdcFor, minOut[i], deadline);
            if (amountsOut[i] > 0) {
                IERC20(constituents[i]).safeTransfer(recipient, amountsOut[i]);
            }
        }
        usdc.forceApprove(address(swapAdapter), 0);
        emit BasketBought(msg.sender, recipient, usdcIn, amountsOut);
    }

    function _refundUsdc(address to) internal {
        uint256 dust = usdc.balanceOf(address(this));
        if (dust > 0) usdc.safeTransfer(to, dust);
    }

    function _refundTokens(address[] memory cons, address to) internal {
        for (uint256 i = 0; i < cons.length; ++i) {
            uint256 bal = IERC20(cons[i]).balanceOf(address(this));
            if (bal > 0) IERC20(cons[i]).safeTransfer(to, bal);
        }
        _refundUsdc(to);
    }
}
