// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";

import {IndexFactory} from "../../src/core/IndexFactory.sol";
import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../../src/accretion/AccretionEngine.sol";
import {IndexZapRouter} from "../../src/periphery/IndexZapRouter.sol";
import {IndexLauncher} from "../../src/launch/IndexLauncher.sol";
import {IndexFeeHook} from "../../src/fees/IndexFeeHook.sol";
import {HookMiner} from "../../src/libs/HookMiner.sol";
import {IPoolManagerMinimal} from "../../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {LocalPoolManager} from "../harness/LocalPoolManager.sol";
import {LocalPositionManager} from "../harness/LocalPositionManager.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";
import {MockSwapAdapter} from "../mocks/MockSwapAdapter.sol";

/**
 * @title OmnibitLoop
 * @notice Local full-loop: createSeed -> initializeMarket -> fee sim -> sweep -> harvest -> redeem.
 */
contract OmnibitLoopTest is Test {
    using PoolIdLibrary for PoolKey;

    LocalPoolManager public pm;
    LocalPositionManager public posm;
    IndexFactory public factory;
    IndexZapRouter public zap;
    IndexLauncher public launcher;
    IndexFeeHook public hook;
    MockERC20 public usdc;
    MockERC20 public tNVDA;
    MockERC20 public tMSFT;
    MockSwapAdapter public adapter;

    address public treasury = makeAddr("treasury");
    address public creator = makeAddr("creator");
    address public trader = makeAddr("trader");

    AccretiveIndex public index;
    AccretionEngine public engine;
    PoolId public poolId;

    function setUp() public {
        pm = new LocalPoolManager();
        posm = new LocalPositionManager();
        usdc = new MockERC20("USDC", "USDC", 6);
        tNVDA = new MockERC20("tNVDA", "tNVDA", 18);
        tMSFT = new MockERC20("tMSFT", "tMSFT", 18);

        MockPriceFeed nvdaFeed = new MockPriceFeed("tNVDA/USD", 200_00000000);
        MockPriceFeed msftFeed = new MockPriceFeed("tMSFT/USD", 500_00000000);

        adapter = new MockSwapAdapter();
        adapter.setOutPerInWad(address(usdc), address(tNVDA), 5e27);
        adapter.setOutPerInWad(address(usdc), address(tMSFT), 2e27);

        _deployHookAndProtocol(nvdaFeed, msftFeed);
    }

    function _deployHookAndProtocol(MockPriceFeed nvdaFeed, MockPriceFeed msftFeed) internal {
        bytes memory ctorArgs = abi.encode(IPoolManagerMinimal(address(pm)));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), HookMiner.indexFeeHookFlags(), type(IndexFeeHook).creationCode, ctorArgs);
        hook = new IndexFeeHook{salt: salt}(IPoolManagerMinimal(address(pm)));
        require(address(hook) == hookAddr, "hook salt");

        AccretiveIndex indexImpl = new AccretiveIndex();
        AccretionEngine engineImpl = new AccretionEngine();

        factory = new IndexFactory(
            address(indexImpl),
            address(engineImpl),
            address(usdc),
            address(this),
            treasury,
            address(adapter),
            address(this)
        );
        factory.approveAsset(address(tNVDA), address(nvdaFeed));
        factory.approveAsset(address(tMSFT), address(msftFeed));

        zap = new IndexZapRouter(factory, address(usdc), address(adapter), address(this));
        launcher =
            new IndexLauncher(factory, address(usdc), zap, hook, IPoolManagerMinimal(address(pm)), posm, address(this));

        factory.setLauncher(address(launcher));
        hook.setLauncher(address(launcher));
        hook.setUsdc(address(usdc));
        hook.setProtocolTreasury(treasury);
        hook.setFactory(address(factory));
    }

    function test_fullLoop_postHarvestRedeemGetsMoreBasket() public {
        _createSeedAndMarket();
        _simulateHookFees();

        uint256 redeemShares = 100e18;
        vm.prank(creator);
        index.transfer(trader, redeemShares);

        (uint256[] memory outBefore,,) = index.previewRedeem(redeemShares);
        uint256 supplyBefore = index.totalSupply();
        uint256 trackedBefore = index.trackedBalance(address(tNVDA));
        uint256 usdBefore = index.cumulativeAccretedUsdWad();

        _sweepAndHarvest();

        assertEq(index.totalSupply(), supplyBefore, "harvest must not mint");
        assertGt(index.trackedBalance(address(tNVDA)), trackedBefore);
        assertGt(index.cumulativeAccretedUsdWad(), usdBefore);

        (uint256[] memory outAfter,,) = index.previewRedeem(redeemShares);
        assertGt(outAfter[0], outBefore[0], "more tNVDA");
        assertGt(outAfter[1], outBefore[1], "more tMSFT");

        vm.prank(trader);
        uint256[] memory got = index.redeem(redeemShares, trader);
        assertEq(got[0], outAfter[0]);
        assertEq(tNVDA.balanceOf(trader), got[0]);
        assertEq(tMSFT.balanceOf(trader), got[1]);
    }

    function _createSeedAndMarket() internal {
        uint256 backing = 1000e6;
        usdc.mint(creator, backing + 200e6);

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        IndexFactory.CreateIndexParams memory params = IndexFactory.CreateIndexParams({
            name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
        });

        uint256[] memory mins = new uint256[](2);
        vm.startPrank(creator);
        usdc.approve(address(launcher), type(uint256).max);
        (address indexAddr, address engineAddr,) =
            launcher.createSeed(params, backing, backing, mins, block.timestamp + 1);
        index = AccretiveIndex(indexAddr);
        engine = AccretionEngine(engineAddr);

        uint256 lpUSDC = 50e6;
        usdc.mint(creator, lpUSDC);
        index.approve(address(launcher), 50e18);
        (poolId,) = launcher.initializeMarket(indexAddr, lpUSDC, lpUSDC, block.timestamp + 1);
        vm.stopPrank();

        assertTrue(launcher.marketInitialized(indexAddr));
    }

    function _simulateHookFees() internal {
        usdc.mint(address(pm), 1_000e6);
        PoolKey memory key = _poolKey();
        bool usdcIs0 = Currency.unwrap(key.currency0) == address(usdc);
        SwapParams memory buyParams =
            SwapParams({zeroForOne: usdcIs0, amountSpecified: -int256(1000e6), sqrtPriceLimitX96: 0});
        vm.prank(address(pm));
        hook.beforeSwap(trader, key, buyParams, "");
        assertEq(hook.pendingHookUsdc(poolId), 500_000);
    }

    function _sweepAndHarvest() internal {
        (, uint256 eCut) = hook.sweepFees(poolId);
        assertEq(usdc.balanceOf(address(engine)), eCut);
        assertGt(eCut, 0);

        uint256[] memory minOut = new uint256[](2);
        vm.prank(trader);
        uint256[] memory recognized = engine.harvest(minOut, block.timestamp + 1);
        assertGt(recognized[0] + recognized[1], 0);
    }

    function _poolKey() internal view returns (PoolKey memory key) {
        address indexToken = address(index);
        (Currency c0, Currency c1) = indexToken < address(usdc)
            ? (Currency.wrap(indexToken), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(indexToken));
        key = PoolKey({currency0: c0, currency1: c1, fee: 500, tickSpacing: 10, hooks: IHooks(address(hook))});
    }
}
