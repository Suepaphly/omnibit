// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";

import {IndexFactory} from "../core/IndexFactory.sol";
import {AccretiveIndex} from "../core/AccretiveIndex.sol";
import {IndexZapRouter} from "../periphery/IndexZapRouter.sol";
import {IndexFeeHook} from "../fees/IndexFeeHook.sol";
import {IPoolManagerMinimal} from "../periphery/interfaces/IPoolManagerMinimal.sol";
import {IPositionManagerMinimal} from "../periphery/interfaces/IPositionManagerMinimal.sol";
import {SqrtPriceLib} from "../libs/SqrtPriceLib.sol";
import {NavLib} from "../libs/NavLib.sol";
import {AggregatorV3Interface} from "../testnet/MockPriceFeed.sol";

/**
 * @title IndexLauncher
 * @notice Two-transaction launch: createSeed → initializeMarket.
 * @dev Tx1 createSeed: factory.createIndex → pull USDC → buyTargetBasket at launch weights →
 *      seed fee-free (~$1 NAV) → refund unused USDC.
 *      Tx2 initializeMarket: require seeded; register PoolId on hook; PoolManager.initialize;
 *      full-range LP via PositionManager; NFT to creator.
 *
 *      Hook registration + PoolManager.initialize stay launcher-owned.
 *      Unit tests inject LocalPoolManager / LocalPositionManager / mock feeds.
 */
contract IndexLauncher is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using Math for uint256;

    uint24 public constant POOL_FEE = 500;
    int24 public constant TICK_SPACING = 10;
    uint8 public constant INDEX_DECIMALS = 18;
    uint8 public constant USDC_DECIMALS = 6;
    uint8 public constant FEED_DECIMALS = 8;

    IndexFactory public immutable factory;
    IERC20 public immutable usdc;
    IndexZapRouter public immutable zap;
    IndexFeeHook public immutable hook;
    IPoolManagerMinimal public immutable poolManager;
    IPositionManagerMinimal public immutable positionManager;

    address public owner;

    mapping(address => address) public creatorOf;
    mapping(address => bool) public marketInitialized;

    error ZeroAddress();
    error OnlyOwner();
    error DeadlineExpired();
    error NotSeeded();
    error AlreadyInitialized();
    error NotCreator();
    error MaxUsdcExceeded();
    error InvalidNav();

    event OwnerUpdated(address indexed owner);
    event IndexSeeded(
        address indexed index,
        address indexed engine,
        address indexed creator,
        uint256 grossShares,
        uint256 usdcSpent,
        uint256[] amounts
    );
    event MarketInitialized(
        address indexed index, PoolId indexed poolId, uint256 positionTokenId, uint160 sqrtPriceX96
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(
        IndexFactory factory_,
        address usdc_,
        IndexZapRouter zap_,
        IndexFeeHook hook_,
        IPoolManagerMinimal poolManager_,
        IPositionManagerMinimal positionManager_,
        address owner_
    ) {
        if (
            address(factory_) == address(0) || usdc_ == address(0) || address(zap_) == address(0)
                || address(hook_) == address(0) || address(poolManager_) == address(0)
                || address(positionManager_) == address(0) || owner_ == address(0)
        ) {
            revert ZeroAddress();
        }
        factory = factory_;
        usdc = IERC20(usdc_);
        zap = zap_;
        hook = hook_;
        poolManager = poolManager_;
        positionManager = positionManager_;
        owner = owner_;
    }

    function setOwner(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnerUpdated(owner_);
    }

    /**
     * @notice Tx1: create index pair, buy launch-weight basket with USDC, fee-free seed @ ~$1 NAV.
     */
    function createSeed(
        IndexFactory.CreateIndexParams calldata indexParams,
        uint256 backingUSDC,
        uint256 maxBackingUSDC,
        uint256 deadline
    ) external nonReentrant returns (address index, address accretionEngine, uint256 grossShares) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (backingUSDC == 0 || maxBackingUSDC < backingUSDC) revert MaxUsdcExceeded();

        address creator = indexParams.creator;
        if (creator == address(0)) revert ZeroAddress();

        usdc.safeTransferFrom(msg.sender, address(this), maxBackingUSDC);

        (index, accretionEngine) = factory.createIndex(indexParams);
        creatorOf[index] = creator;

        address[] memory cons = indexParams.constituents;
        uint16[] memory weights = indexParams.initialWeightsBps;
        uint256 n = cons.length;
        uint256[] memory minOut = new uint256[](n);

        usdc.forceApprove(address(zap), backingUSDC);
        uint256[] memory amounts =
            zap.buyTargetBasketFor(address(this), address(this), cons, weights, backingUSDC, minOut, deadline);
        usdc.forceApprove(address(zap), 0);

        // Use actual balances received (handles any transfer quirks)
        for (uint256 i = 0; i < n; ++i) {
            amounts[i] = IERC20(cons[i]).balanceOf(address(this));
        }

        grossShares = _grossSharesForOneDollarNav(cons, amounts);
        if (grossShares == 0) revert InvalidNav();

        for (uint256 i = 0; i < n; ++i) {
            if (amounts[i] > 0) IERC20(cons[i]).forceApprove(index, amounts[i]);
        }
        AccretiveIndex(index).seed(amounts, grossShares, creator);
        for (uint256 i = 0; i < n; ++i) {
            if (amounts[i] > 0) IERC20(cons[i]).forceApprove(index, 0);
        }

        uint256 refund = usdc.balanceOf(address(this));
        uint256 spent = maxBackingUSDC - refund;
        if (refund > 0) usdc.safeTransfer(msg.sender, refund);

        emit IndexSeeded(index, accretionEngine, creator, grossShares, spent, amounts);
    }

    /**
     * @notice Tx2: register pool on hook, initialize V4 pool at ~$1 NAV, seed full-range LP.
     */
    function initializeMarket(address index, uint256 lpUSDC, uint256 maxLpUSDC, uint256 deadline)
        external
        nonReentrant
        returns (PoolId poolId, uint256 positionTokenId)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (!factory.isIndex(index)) revert ZeroAddress();
        if (marketInitialized[index]) revert AlreadyInitialized();
        if (msg.sender != creatorOf[index] && msg.sender != owner) revert NotCreator();

        AccretiveIndex idx = AccretiveIndex(index);
        if (!idx.seeded()) revert NotSeeded();
        if (lpUSDC == 0 || maxLpUSDC < lpUSDC) revert MaxUsdcExceeded();

        usdc.safeTransferFrom(msg.sender, address(this), maxLpUSDC);

        address engine = factory.engineOf(index);
        uint160 sqrtPriceX96 = SqrtPriceLib.sqrtPriceX96AtOneDollar(index, address(usdc), INDEX_DECIMALS, USDC_DECIMALS);

        PoolKey memory key = _buildPoolKey(index);
        poolId = key.toId();

        hook.registerPool(key, index, engine);
        poolManager.initialize(key, sqrtPriceX96);

        // Pair lpUSDC with equal USD of INDEX at $1 NAV: indexAmount = lpUSDC * 1e12
        uint256 indexAmount = Math.mulDiv(lpUSDC, 10 ** uint256(INDEX_DECIMALS), 10 ** uint256(USDC_DECIMALS));
        IERC20(index).safeTransferFrom(msg.sender, address(this), indexAmount);

        (uint256 amount0Desired, uint256 amount1Desired) =
            index < address(usdc) ? (indexAmount, lpUSDC) : (lpUSDC, indexAmount);

        IERC20(index).forceApprove(address(positionManager), indexAmount);
        usdc.forceApprove(address(positionManager), lpUSDC);

        (positionTokenId,,) =
            positionManager.mintFullRange(key, amount0Desired, amount1Desired, 0, 0, creatorOf[index], deadline);

        marketInitialized[index] = true;

        uint256 idxBal = IERC20(index).balanceOf(address(this));
        if (idxBal > 0) IERC20(index).safeTransfer(msg.sender, idxBal);
        uint256 uBal = usdc.balanceOf(address(this));
        if (uBal > 0) usdc.safeTransfer(msg.sender, uBal);

        IERC20(index).forceApprove(address(positionManager), 0);
        usdc.forceApprove(address(positionManager), 0);

        emit MarketInitialized(index, poolId, positionTokenId, sqrtPriceX96);
    }

    function _buildPoolKey(address index) internal view returns (PoolKey memory key) {
        (Currency c0, Currency c1) = index < address(usdc)
            ? (Currency.wrap(index), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(index));
        key = PoolKey({
            currency0: c0, currency1: c1, fee: POOL_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(address(hook))
        });
    }

    function _grossSharesForOneDollarNav(address[] memory cons, uint256[] memory amounts)
        internal
        view
        returns (uint256)
    {
        uint256 n = cons.length;
        int256[] memory answers = new int256[](n);
        for (uint256 i = 0; i < n; ++i) {
            address feed = factory.priceFeedOf(cons[i]);
            (, int256 answer,,,) = AggregatorV3Interface(feed).latestRoundData();
            answers[i] = answer;
        }
        return NavLib.navWad(amounts, INDEX_DECIMALS, answers, FEED_DECIMALS);
    }
}
