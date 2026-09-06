// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {Hooks} from "@uniswap/v4-core/libraries/Hooks.sol";

import {IndexFeeHook} from "../../src/fees/IndexFeeHook.sol";
import {HookMiner} from "../../src/libs/HookMiner.sol";
import {IPoolManagerMinimal} from "../../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {LocalPoolManager} from "../harness/LocalPoolManager.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract IndexFeeHookTest is Test {
    using PoolIdLibrary for PoolKey;

    LocalPoolManager public pm;
    IndexFeeHook public hook;
    MockERC20 public usdc;
    MockERC20 public indexToken;

    address public admin;
    address public launcher = makeAddr("launcher");
    address public treasury = makeAddr("treasury");
    address public engine = makeAddr("engine");

    PoolKey public key;
    PoolId public poolId;

    function setUp() public {
        pm = new LocalPoolManager();
        usdc = new MockERC20("USDC", "USDC", 6);
        indexToken = new MockERC20("AI2", "AI2", 18);

        // Mine hook address with required flags
        bytes memory ctorArgs = abi.encode(IPoolManagerMinimal(address(pm)));
        uint160 flags = HookMiner.indexFeeHookFlags();
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), flags, type(IndexFeeHook).creationCode, ctorArgs);
        hook = new IndexFeeHook{salt: salt}(IPoolManagerMinimal(address(pm)));
        require(address(hook) == hookAddr, "salt mismatch");

        admin = address(this);
        hook.setLauncher(launcher);
        hook.setUsdc(address(usdc));
        hook.setProtocolTreasury(treasury);

        // Build sorted pool key
        (Currency c0, Currency c1) = address(indexToken) < address(usdc)
            ? (Currency.wrap(address(indexToken)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(indexToken)));
        key = PoolKey({currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks: IHooks(address(hook))});
        poolId = key.toId();
    }

    function test_feeMath_5bps() public view {
        assertEq(hook.calculateHookFee(100_000_000), 50_000); // 100 USDC → 0.05 USDC
        assertEq(hook.calculateHookFee(1), 0); // floors
    }

    function test_splitFees_oddWeiToEngine() public view {
        (uint256 t, uint256 e) = hook.splitFees(101);
        assertEq(t, 50);
        assertEq(e, 51);
    }

    function test_beforeInitialize_rejectsUnregistered() public {
        vm.prank(address(pm));
        vm.expectRevert(abi.encodeWithSelector(IndexFeeHook.PoolNotRegistered.selector, poolId));
        hook.beforeInitialize(address(this), key, 1 << 96);
    }

    function test_beforeInitialize_okWhenRegistered() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);

        vm.prank(address(pm));
        bytes4 sel = hook.beforeInitialize(address(this), key, 1 << 96);
        assertEq(sel, IHooks.beforeInitialize.selector);
    }

    function test_buyFee_takesUsdcIn() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);

        // Fund PM so take() works
        usdc.mint(address(pm), 1_000e6);

        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        // Buy: sell USDC for INDEX → specified is USDC
        SwapParams memory params =
            SwapParams({zeroForOne: usdcIs0, amountSpecified: -int256(100e6), sqrtPriceLimitX96: 0});

        vm.prank(address(pm));
        (bytes4 sel,,) = hook.beforeSwap(address(this), key, params, "");
        assertEq(sel, IHooks.beforeSwap.selector);

        // 5 bps of 100e6 = 0.05e6 = 50000
        assertEq(hook.pendingHookUsdc(poolId), 50_000);
        assertEq(usdc.balanceOf(address(hook)), 50_000);
    }

    function test_sellFee_takesUsdcOut() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);
        usdc.mint(address(pm), 1_000e6);

        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        // Sell: sell INDEX for USDC → specified is INDEX (not USDC)
        SwapParams memory params = SwapParams({
            zeroForOne: !usdcIs0, // INDEX → USDC
            amountSpecified: -int256(1e18),
            sqrtPriceLimitX96: 0
        });

        // Simulate afterSwap delta: caller received 100e6 USDC
        BalanceDelta delta =
            usdcIs0 ? toBalanceDelta(int128(100e6), -int128(1e18)) : toBalanceDelta(-int128(1e18), int128(100e6));

        vm.prank(address(pm));
        (, int128 takeAmt) = hook.afterSwap(address(this), key, params, delta, "");
        assertEq(uint256(uint128(takeAmt)), 50_000);
        assertEq(hook.pendingHookUsdc(poolId), 50_000);
    }

    function test_exactOut_reverts() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);

        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        SwapParams memory params = SwapParams({zeroForOne: usdcIs0, amountSpecified: int256(1e6), sqrtPriceLimitX96: 0});

        vm.prank(address(pm));
        vm.expectRevert(IndexFeeHook.ExactOutNotAllowed.selector);
        hook.beforeSwap(address(this), key, params, "");
    }

    function test_sweepFees_50_50() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);

        // Accrue pending by minting USDC directly to hook and setting storage via buy path
        usdc.mint(address(pm), 1_000e6);
        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        SwapParams memory params =
            SwapParams({zeroForOne: usdcIs0, amountSpecified: -int256(100e6), sqrtPriceLimitX96: 0});
        vm.prank(address(pm));
        hook.beforeSwap(address(this), key, params, "");

        // pending = 50000; odd split: 25000 / 25000
        (uint256 tCut, uint256 eCut) = hook.sweepFees(poolId);
        assertEq(tCut, 25_000);
        assertEq(eCut, 25_000);
        assertEq(usdc.balanceOf(treasury), 25_000);
        assertEq(usdc.balanceOf(engine), 25_000);
        assertEq(hook.pendingHookUsdc(poolId), 0);
    }

    function test_guardian_disablesFeeTake() public {
        vm.prank(launcher);
        hook.registerPool(key, address(indexToken), engine);
        hook.setFeeTakeDisabled(true);

        usdc.mint(address(pm), 1_000e6);
        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        SwapParams memory params =
            SwapParams({zeroForOne: usdcIs0, amountSpecified: -int256(100e6), sqrtPriceLimitX96: 0});
        vm.prank(address(pm));
        hook.beforeSwap(address(this), key, params, "");
        assertEq(hook.pendingHookUsdc(poolId), 0);
    }

    function test_onlyLauncher_register() public {
        vm.expectRevert(IndexFeeHook.OnlyLauncher.selector);
        hook.registerPool(key, address(indexToken), engine);
    }
}
