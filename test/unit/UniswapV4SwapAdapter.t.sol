// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";

import {IndexFactory} from "../../src/core/IndexFactory.sol";
import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../../src/accretion/AccretionEngine.sol";
import {UniswapV4SwapAdapter} from "../../src/periphery/UniswapV4SwapAdapter.sol";
import {IPoolManagerMinimal} from "../../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {LocalPoolManager} from "../harness/LocalPoolManager.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";

contract UniswapV4SwapAdapterTest is Test {
    LocalPoolManager public pm;
    UniswapV4SwapAdapter public adapter;
    IndexFactory public factory;
    MockERC20 public usdc;
    MockERC20 public tNVDA;

    address public admin = makeAddr("admin");
    address public launcher = makeAddr("launcher");
    address public treasury = makeAddr("treasury");
    address public router = makeAddr("router");
    address public stranger = makeAddr("stranger");
    address public engine;

    function setUp() public {
        pm = new LocalPoolManager();
        usdc = new MockERC20("USDC", "USDC", 6);
        tNVDA = new MockERC20("tNVDA", "tNVDA", 18);
        MockPriceFeed feed = new MockPriceFeed("tNVDA/USD", 200_00000000);

        AccretiveIndex indexImpl = new AccretiveIndex();
        AccretionEngine engineImpl = new AccretionEngine();
        // Temporary factory with zero adapter; we set production adapter after
        factory = new IndexFactory(
            address(indexImpl), address(engineImpl), address(usdc), launcher, treasury, address(0), admin
        );

        vm.prank(admin);
        factory.approveAsset(address(tNVDA), address(feed));

        // Need a second asset for createIndex — use another mock
        MockERC20 tMSFT = new MockERC20("tMSFT", "tMSFT", 18);
        MockPriceFeed feed2 = new MockPriceFeed("tMSFT/USD", 500_00000000);
        vm.prank(admin);
        factory.approveAsset(address(tMSFT), address(feed2));

        adapter = new UniswapV4SwapAdapter(IPoolManagerMinimal(address(pm)), factory, address(usdc), admin);
        vm.prank(admin);
        adapter.setRouter(router);

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        vm.prank(launcher);
        (, engine) = factory.createIndex(
            IndexFactory.CreateIndexParams({
                name: "AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: admin
            })
        );

        // Register NVDA/USDC pool key
        (Currency c0, Currency c1) = address(tNVDA) < address(usdc)
            ? (Currency.wrap(address(tNVDA)), Currency.wrap(address(usdc)))
            : (Currency.wrap(address(usdc)), Currency.wrap(address(tNVDA)));
        PoolKey memory key =
            PoolKey({currency0: c0, currency1: c1, fee: 3000, tickSpacing: 60, hooks: IHooks(address(0))});
        vm.prank(admin);
        adapter.registerPoolKey(key);

        // Harness requires initialize before swap (production adapter assumes live pool)
        pm.initialize(key, uint160(1 << 96));

        pm.setOutPerInWad(address(usdc), address(tNVDA), 5e27);
        // Fund PM with tNVDA inventory for take()
        tNVDA.mint(address(pm), 1_000_000e18);
    }

    function test_allowlist_rejectsStranger() public {
        usdc.mint(stranger, 10e6);
        vm.startPrank(stranger);
        usdc.approve(address(adapter), 10e6);
        vm.expectRevert(UniswapV4SwapAdapter.NotAllowedCaller.selector);
        adapter.swapExactInput(address(usdc), address(tNVDA), 10e6, 0, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_allowlist_routerOk() public {
        usdc.mint(router, 10e6);
        vm.startPrank(router);
        usdc.approve(address(adapter), 10e6);
        uint256 out = adapter.swapExactInput(address(usdc), address(tNVDA), 10e6, 0, block.timestamp + 1);
        vm.stopPrank();
        // 10 USDC → 0.05 tNVDA at $200
        assertEq(out, 0.05e18);
        assertEq(tNVDA.balanceOf(router), 0.05e18);
    }

    function test_allowlist_engineOk() public {
        usdc.mint(engine, 10e6);
        vm.startPrank(engine);
        usdc.approve(address(adapter), 10e6);
        uint256 out = adapter.swapExactInput(address(usdc), address(tNVDA), 10e6, 0, block.timestamp + 1);
        vm.stopPrank();
        assertEq(out, 0.05e18);
    }

    function test_unregisteredPair_reverts() public {
        MockERC20 other = new MockERC20("OTHER", "O", 18);
        usdc.mint(router, 10e6);
        vm.startPrank(router);
        usdc.approve(address(adapter), 10e6);
        vm.expectRevert(UniswapV4SwapAdapter.PoolNotRegistered.selector);
        adapter.swapExactInput(address(usdc), address(other), 10e6, 0, block.timestamp + 1);
        vm.stopPrank();
    }
}
