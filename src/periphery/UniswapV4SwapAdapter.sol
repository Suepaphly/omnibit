// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";

import {IUniswapV4SwapAdapter} from "./interfaces/IUniswapV4SwapAdapter.sol";
import {IPoolManagerMinimal} from "./interfaces/IPoolManagerMinimal.sol";
import {IUnlockCallback} from "./interfaces/IUnlockCallback.sol";
import {IndexFactory} from "../core/IndexFactory.sol";

/**
 * @title UniswapV4SwapAdapter
 * @notice Production-shaped exact-in adapter for constituent ↔ USDC swaps via V4 PoolManager.
 * @dev Allowlist:
 *      - Callers: IndexZapRouter + factory.isEngine engines only
 *      - Pools: guardian/admin-registered constituent/USDC PoolKeys only
 *
 *      One PoolManager.unlock per swapExactInput. unlockCallback is guarded (only PoolManager;
 *      fixed SwapRequest layout — no arbitrary callee calldata).
 *
 *      Unit tests use LocalPoolManager which simulates swaps; production uses live V4 PoolManager.
 */
contract UniswapV4SwapAdapter is IUniswapV4SwapAdapter, IUnlockCallback, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    IPoolManagerMinimal public immutable poolManager;
    IndexFactory public immutable factory;
    address public immutable usdc;

    address public router; // IndexZapRouter

    mapping(PoolId => PoolKey) internal _poolKeys;
    mapping(PoolId => bool) public isRegisteredPool;
    /// @dev tokenIn => tokenOut => poolId (both directions registered when a PoolKey is added)
    mapping(address => mapping(address => PoolId)) public poolIdForPair;

    bool internal _unlocking;

    struct SwapRequest {
        address caller;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minOut;
    }

    error ZeroAddress();
    error NotAllowedCaller();
    error PoolNotRegistered();
    error DeadlineExpired();
    error ZeroAmount();
    error InsufficientOut();
    error OnlyPoolManager();
    error UnexpectedUnlock();
    error InvalidPoolKey();
    error PairMismatch();

    event RouterUpdated(address indexed router);
    event PoolRegistered(PoolId indexed poolId, address token0, address token1);
    event PoolUnregistered(PoolId indexed poolId);

    constructor(IPoolManagerMinimal poolManager_, IndexFactory factory_, address usdc_, address admin_) {
        if (
            address(poolManager_) == address(0) || address(factory_) == address(0) || usdc_ == address(0)
                || admin_ == address(0)
        ) {
            revert ZeroAddress();
        }
        poolManager = poolManager_;
        factory = factory_;
        usdc = usdc_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(GUARDIAN_ROLE, admin_);
    }

    function setRouter(address router_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (router_ == address(0)) revert ZeroAddress();
        router = router_;
        emit RouterUpdated(router_);
    }

    /**
     * @notice Guardian: register a constituent/USDC PoolKey (currencies MUST be sorted; one leg USDC).
     */
    function registerPoolKey(PoolKey calldata key) external onlyRole(GUARDIAN_ROLE) {
        address t0 = Currency.unwrap(key.currency0);
        address t1 = Currency.unwrap(key.currency1);
        if (t0 >= t1) revert InvalidPoolKey();
        if (t0 != usdc && t1 != usdc) revert InvalidPoolKey();

        PoolId id = key.toId();
        _poolKeys[id] = key;
        isRegisteredPool[id] = true;
        poolIdForPair[t0][t1] = id;
        poolIdForPair[t1][t0] = id;
        emit PoolRegistered(id, t0, t1);
    }

    function unregisterPoolKey(PoolId id) external onlyRole(GUARDIAN_ROLE) {
        if (!isRegisteredPool[id]) revert PoolNotRegistered();
        PoolKey memory key = _poolKeys[id];
        address t0 = Currency.unwrap(key.currency0);
        address t1 = Currency.unwrap(key.currency1);
        poolIdForPair[t0][t1] = PoolId.wrap(bytes32(0));
        poolIdForPair[t1][t0] = PoolId.wrap(bytes32(0));
        delete _poolKeys[id];
        delete isRegisteredPool[id];
        emit PoolUnregistered(id);
    }

    function getPoolKey(PoolId id) external view returns (PoolKey memory) {
        if (!isRegisteredPool[id]) revert PoolNotRegistered();
        return _poolKeys[id];
    }

    /// @inheritdoc IUniswapV4SwapAdapter
    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        override
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0) revert ZeroAmount();
        if (!_isAllowedCaller(msg.sender)) revert NotAllowedCaller();

        PoolId id = poolIdForPair[tokenIn][tokenOut];
        if (!isRegisteredPool[id]) revert PoolNotRegistered();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        SwapRequest memory req =
            SwapRequest({caller: msg.sender, tokenIn: tokenIn, tokenOut: tokenOut, amountIn: amountIn, minOut: minOut});

        _unlocking = true;
        bytes memory result = poolManager.unlock(abi.encode(req));
        _unlocking = false;

        amountOut = abi.decode(result, (uint256));
        if (amountOut < minOut) revert InsufficientOut();

        IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external override returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert OnlyPoolManager();
        if (!_unlocking) revert UnexpectedUnlock();

        SwapRequest memory req = abi.decode(data, (SwapRequest));
        PoolId id = poolIdForPair[req.tokenIn][req.tokenOut];
        if (!isRegisteredPool[id]) revert PoolNotRegistered();
        PoolKey memory key = _poolKeys[id];

        bool zeroForOne = req.tokenIn < req.tokenOut; // tokenIn is currency0 ⇒ zeroForOne
        // Verify pair matches key currencies
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (!((req.tokenIn == c0 && req.tokenOut == c1) || (req.tokenIn == c1 && req.tokenOut == c0))) {
            revert PairMismatch();
        }
        zeroForOne = (req.tokenIn == c0);

        // Exact-in: amountSpecified negative
        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(req.amountIn),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });

        // Settle input into PoolManager, then swap, then take output.
        Currency currencyIn = Currency.wrap(req.tokenIn);
        Currency currencyOut = Currency.wrap(req.tokenOut);

        IERC20(req.tokenIn).forceApprove(address(poolManager), req.amountIn);
        poolManager.sync(currencyIn);
        // Transfer tokens to PM then settle — LocalPoolManager accepts transferFrom; real PM uses settle after sync.
        IERC20(req.tokenIn).safeTransfer(address(poolManager), req.amountIn);
        poolManager.settle();

        BalanceDelta delta = poolManager.swap(key, params, bytes(""));

        int128 outDelta = zeroForOne ? delta.amount1() : delta.amount0();
        // Positive outDelta = caller (adapter) received tokenOut
        if (outDelta <= 0) revert InsufficientOut();
        uint256 amountOut = uint256(uint128(outDelta));

        poolManager.take(currencyOut, address(this), amountOut);

        return abi.encode(amountOut);
    }

    function _isAllowedCaller(address caller) internal view returns (bool) {
        if (caller == router && router != address(0)) return true;
        return factory.isEngine(caller);
    }
}
