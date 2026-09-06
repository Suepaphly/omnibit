// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/types/PoolOperation.sol";
import {Hooks} from "@uniswap/v4-core/libraries/Hooks.sol";

import {IPoolManagerMinimal} from "../periphery/interfaces/IPoolManagerMinimal.sol";

/**
 * @title IndexFeeHook
 * @notice Global Uniswap V4 hook for canonical INDEX/USDC pools.
 * @dev Permission flags (MUST be mined into address via HookMiner/CREATE2):
 *      beforeInitialize, beforeSwap, afterSwap, beforeSwapReturnDelta, afterSwapReturnDelta.
 *
 *      Fee policy (exact-in only; exact-out rejected on registered pools):
 *      - Buy  (USDC → INDEX): take 5 bps of USDC input in beforeSwap
 *      - Sell (INDEX → USDC): take 5 bps of USDC output in afterSwap
 *      Never take INDEX/AI2 as the protocol fee. Accrue pendingHookUsdc[poolId].
 *
 *      sweepFees: treasuryCut = pending/2; engineCut = pending - treasuryCut (odd wei → engine).
 *
 *      beforeInitialize rejects unless PoolId was registered by IndexLauncher.
 *      Guardian MAY disable fee take without unregistering the pool.
 *
 *      Constructor takes PoolManager only (spec). USDC / launcher / factory / treasury wired via admin.
 */
contract IndexFeeHook is IHooks, AccessControl, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using BalanceDeltaLibrary for BalanceDelta;
    using SafeERC20 for IERC20;
    using Hooks for IHooks;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint16 public constant HOOK_FEE_BPS = 5;
    uint16 public constant MAX_BPS = 10_000;

    IPoolManagerMinimal public immutable poolManager;

    address public launcher;
    address public factory;
    address public usdc;
    address public protocolTreasury;

    /// @dev When true, fee take is skipped (emergency). Registration / init gate still apply.
    bool public feeTakeDisabled;

    struct PoolRecord {
        bool registered;
        address index;
        address engine;
    }

    mapping(PoolId => PoolRecord) public pools;
    mapping(PoolId => uint256) public pendingHookUsdc;

    error NotPoolManager();
    error ZeroAddress();
    error OnlyLauncher();
    error PoolNotRegistered(PoolId poolId);
    error PoolAlreadyRegistered(PoolId poolId);
    error ExactOutNotAllowed();
    error HookNotImplemented();
    error NoPendingFees();
    error InvalidHookAddress();

    event LauncherUpdated(address indexed launcher);
    event FactoryUpdated(address indexed factory);
    event UsdcUpdated(address indexed usdc);
    event ProtocolTreasuryUpdated(address indexed treasury);
    event FeeTakeDisabledUpdated(bool disabled);
    event PoolRegistered(PoolId indexed poolId, address indexed index, address indexed engine);
    event HookFeeAccrued(PoolId indexed poolId, uint256 feeUsdc, bool isBuy);
    event FeesSwept(PoolId indexed poolId, uint256 treasuryCut, uint256 engineCut);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /**
     * @notice Deploy via CREATE2 so address permission bits match `getHookPermissions()`.
     * @param poolManager_ Uniswap V4 PoolManager (or LocalPoolManager in tests).
     */
    constructor(IPoolManagerMinimal poolManager_) {
        if (address(poolManager_) == address(0)) revert ZeroAddress();
        poolManager = poolManager_;

        Hooks.Permissions memory perms = getHookPermissions();
        IHooks(address(this)).validateHookPermissions(perms);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GUARDIAN_ROLE, msg.sender);
    }

    /// @notice Required permission flags for HookMiner.
    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    function setLauncher(address launcher_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (launcher_ == address(0)) revert ZeroAddress();
        launcher = launcher_;
        emit LauncherUpdated(launcher_);
    }

    function setFactory(address factory_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactoryUpdated(factory_);
    }

    function setUsdc(address usdc_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = usdc_;
        emit UsdcUpdated(usdc_);
    }

    function setProtocolTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        protocolTreasury = treasury_;
        emit ProtocolTreasuryUpdated(treasury_);
    }

    /// @notice Guardian emergency: disable (or re-enable) protocol fee take.
    function setFeeTakeDisabled(bool disabled) external onlyRole(GUARDIAN_ROLE) {
        feeTakeDisabled = disabled;
        emit FeeTakeDisabledUpdated(disabled);
    }

    /**
     * @notice Launcher-only: register a canonical INDEX/USDC PoolId before initialize.
     * @param key PoolKey that will be initialized (fee=500, tickSpacing=10, this hook).
     * @param index AccretiveIndex share token.
     * @param engine AccretionEngine for this index (sweep destination).
     */
    function registerPool(PoolKey calldata key, address index, address engine) external {
        if (msg.sender != launcher) revert OnlyLauncher();
        if (index == address(0) || engine == address(0)) revert ZeroAddress();
        if (address(key.hooks) != address(this)) revert InvalidHookAddress();

        PoolId id = key.toId();
        if (pools[id].registered) revert PoolAlreadyRegistered(id);
        pools[id] = PoolRecord({registered: true, index: index, engine: engine});
        emit PoolRegistered(id, index, engine);
    }

    // -------------------------------------------------------------------------
    // Fee math (public for unit tests / harness)
    // -------------------------------------------------------------------------

    /// @notice 5 bps of `usdcAmount`, floored.
    function calculateHookFee(uint256 usdcAmount) public pure returns (uint256) {
        return (usdcAmount * uint256(HOOK_FEE_BPS)) / uint256(MAX_BPS);
    }

    /// @notice Integer 50/50 split; odd wei goes to engine.
    function splitFees(uint256 pending) public pure returns (uint256 treasuryCut, uint256 engineCut) {
        treasuryCut = pending / 2;
        engineCut = pending - treasuryCut;
    }

    /**
     * @notice Permissionless sweep of accrued hook USDC for a pool.
     * @dev Pulls USDC balance held by this hook attributed to `pendingHookUsdc[poolId]`.
     */
    function sweepFees(PoolId poolId) external nonReentrant returns (uint256 treasuryCut, uint256 engineCut) {
        PoolRecord memory rec = pools[poolId];
        if (!rec.registered) revert PoolNotRegistered(poolId);

        uint256 pending = pendingHookUsdc[poolId];
        if (pending == 0) revert NoPendingFees();

        address treasury_ = protocolTreasury;
        if (treasury_ == address(0) || usdc == address(0)) revert ZeroAddress();

        pendingHookUsdc[poolId] = 0;
        (treasuryCut, engineCut) = splitFees(pending);

        if (treasuryCut > 0) IERC20(usdc).safeTransfer(treasury_, treasuryCut);
        if (engineCut > 0) IERC20(usdc).safeTransfer(rec.engine, engineCut);

        emit FeesSwept(poolId, treasuryCut, engineCut);
    }

    // -------------------------------------------------------------------------
    // IHooks — active
    // -------------------------------------------------------------------------

    function beforeInitialize(address, PoolKey calldata key, uint160) external view onlyPoolManager returns (bytes4) {
        PoolId id = key.toId();
        if (!pools[id].registered) revert PoolNotRegistered(id);
        return IHooks.beforeInitialize.selector;
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId id = key.toId();
        PoolRecord memory rec = pools[id];
        if (!rec.registered) revert PoolNotRegistered(id);

        // Exact-out: amountSpecified > 0
        if (params.amountSpecified > 0) revert ExactOutNotAllowed();

        if (feeTakeDisabled || usdc == address(0)) {
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        // Buy = selling USDC for INDEX (specified currency is USDC on exact-in)
        address specified = params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1);
        if (specified != usdc) {
            // Sell path: fee taken in afterSwap from USDC out
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        uint256 absIn = uint256(-params.amountSpecified);
        uint256 fee = calculateHookFee(absIn);
        if (fee == 0) {
            return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        // Positive specified delta: hook takes `fee` of the specified (USDC) currency.
        pendingHookUsdc[id] += fee;
        // Pull USDC from PoolManager into this hook (custom accounting settlement).
        poolManager.take(Currency.wrap(usdc), address(this), fee);

        emit HookFeeAccrued(id, fee, true);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(uint128(fee)), 0), 0);
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId id = key.toId();
        PoolRecord memory rec = pools[id];
        if (!rec.registered) revert PoolNotRegistered(id);

        if (params.amountSpecified > 0) revert ExactOutNotAllowed();

        if (feeTakeDisabled || usdc == address(0)) {
            return (IHooks.afterSwap.selector, 0);
        }

        // Sell = specified is INDEX (not USDC); take 5 bps of USDC output (unspecified).
        address specified = params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1);
        if (specified == usdc) {
            // Buy already charged in beforeSwap
            return (IHooks.afterSwap.selector, 0);
        }

        // USDC output amount: for exact-in, unspecified delta is the output currency amount.
        // BalanceDelta: amount0 / amount1 are from the caller's perspective (positive = caller received).
        bool usdcIsCurrency0 = Currency.unwrap(key.currency0) == usdc;
        int128 usdcDelta = usdcIsCurrency0 ? delta.amount0() : delta.amount1();
        // Caller receives USDC ⇒ positive delta for USDC. Fee from that output.
        if (usdcDelta <= 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        uint256 fee = calculateHookFee(uint256(uint128(usdcDelta)));
        if (fee == 0) {
            return (IHooks.afterSwap.selector, 0);
        }

        pendingHookUsdc[id] += fee;
        poolManager.take(Currency.wrap(usdc), address(this), fee);

        emit HookFeeAccrued(id, fee, false);
        // Positive unspecified delta: hook takes from unspecified (USDC out)
        return (IHooks.afterSwap.selector, int128(uint128(fee)));
    }

    // -------------------------------------------------------------------------
    // IHooks — unused (flags false); must exist for interface
    // -------------------------------------------------------------------------

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
