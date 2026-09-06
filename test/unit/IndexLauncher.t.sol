// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/types/Currency.sol";

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

contract IndexLauncherTest is Test {
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

    address public admin;
    address public treasury = makeAddr("treasury");
    address public creator = makeAddr("creator");

    function setUp() public {
        admin = address(this);
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

        // Mine hook
        bytes memory ctorArgs = abi.encode(IPoolManagerMinimal(address(pm)));
        (address hookAddr, bytes32 salt) =
            HookMiner.find(address(this), HookMiner.indexFeeHookFlags(), type(IndexFeeHook).creationCode, ctorArgs);
        hook = new IndexFeeHook{salt: salt}(IPoolManagerMinimal(address(pm)));
        require(address(hook) == hookAddr, "hook salt");

        AccretiveIndex indexImpl = new AccretiveIndex();
        AccretionEngine engineImpl = new AccretionEngine();

        // Deploy factory with temporary launcher = this, then point to real launcher
        factory = new IndexFactory(
            address(indexImpl), address(engineImpl), address(usdc), address(this), treasury, address(adapter), admin
        );
        factory.approveAsset(address(tNVDA), address(nvdaFeed));
        factory.approveAsset(address(tMSFT), address(msftFeed));

        zap = new IndexZapRouter(factory, address(usdc), address(adapter), admin);

        launcher = new IndexLauncher(factory, address(usdc), zap, hook, IPoolManagerMinimal(address(pm)), posm, admin);

        factory.setLauncher(address(launcher));
        hook.setLauncher(address(launcher));
        hook.setUsdc(address(usdc));
        hook.setProtocolTreasury(treasury);
        hook.setFactory(address(factory));
    }

    function test_createSeed_happyPath() public {
        uint256 backing = 1000e6;
        usdc.mint(creator, backing + 100e6); // extra for refund test

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        IndexFactory.CreateIndexParams memory params = IndexFactory.CreateIndexParams({
            name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
        });

        vm.startPrank(creator);
        usdc.approve(address(launcher), backing + 100e6);
        (address index, address engine, uint256 grossShares) =
            launcher.createSeed(params, backing, backing + 100e6, block.timestamp + 1);
        vm.stopPrank();

        assertTrue(factory.isIndex(index));
        assertTrue(factory.isEngine(engine));
        assertEq(factory.engineOf(index), engine);
        assertTrue(AccretiveIndex(index).seeded());
        assertEq(AccretiveIndex(index).totalSupply(), grossShares);
        assertEq(AccretiveIndex(index).balanceOf(creator), grossShares);

        // Ideal: 500 USDC → 2.5 tNVDA, 500 → 1.0 tMSFT; NAV = 2.5*200 + 1*500 = 1000 → 1000e18 shares
        assertEq(grossShares, 1000e18);
        assertEq(AccretiveIndex(index).trackedBalance(address(tNVDA)), 2.5e18);
        assertEq(AccretiveIndex(index).trackedBalance(address(tMSFT)), 1.0e18);

        // Unused USDC refunded
        assertEq(usdc.balanceOf(creator), 100e6);
        assertEq(launcher.creatorOf(index), creator);
    }

    function test_initializeMarket_happyPath() public {
        // First seed
        uint256 backing = 1000e6;
        usdc.mint(creator, backing + 50e6);
        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        IndexFactory.CreateIndexParams memory params = IndexFactory.CreateIndexParams({
            name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
        });

        vm.startPrank(creator);
        usdc.approve(address(launcher), type(uint256).max);
        (address index,,) = launcher.createSeed(params, backing, backing, block.timestamp + 1);

        // LP: 50 USDC + 50e18 INDEX
        uint256 lpUSDC = 50e6;
        usdc.mint(creator, lpUSDC);
        uint256 indexAmt = 50e18;
        // creator already has 1000e18 from seed
        AccretiveIndex(index).approve(address(launcher), indexAmt);

        (, uint256 tokenId) = launcher.initializeMarket(index, lpUSDC, lpUSDC, block.timestamp + 1);
        vm.stopPrank();

        assertTrue(launcher.marketInitialized(index));
        assertEq(posm.ownerOf(tokenId), creator);
        assertEq(AccretiveIndex(index).balanceOf(creator), 1000e18 - indexAmt);
    }
}
