// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IndexFactory} from "../../src/core/IndexFactory.sol";
import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../../src/accretion/AccretionEngine.sol";
import {IndexZapRouter} from "../../src/periphery/IndexZapRouter.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";
import {MockSwapAdapter} from "../mocks/MockSwapAdapter.sol";

contract IndexZapRouterTest is Test {
    IndexFactory public factory;
    AccretiveIndex public index;
    IndexZapRouter public zap;
    MockERC20 public usdc;
    MockERC20 public tNVDA;
    MockERC20 public tMSFT;
    MockSwapAdapter public adapter;

    address public admin = makeAddr("admin");
    address public launcher = makeAddr("launcher");
    address public treasury = makeAddr("treasury");
    address public creator = makeAddr("creator");
    address public user = makeAddr("user");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        tNVDA = new MockERC20("Test NVDA", "tNVDA", 18);
        tMSFT = new MockERC20("Test MSFT", "tMSFT", 18);
        MockPriceFeed nvdaFeed = new MockPriceFeed("tNVDA/USD", 200_00000000);
        MockPriceFeed msftFeed = new MockPriceFeed("tMSFT/USD", 500_00000000);
        adapter = new MockSwapAdapter();
        adapter.setOutPerInWad(address(usdc), address(tNVDA), 5e27);
        adapter.setOutPerInWad(address(usdc), address(tMSFT), 2e27);

        AccretiveIndex indexImpl = new AccretiveIndex();
        AccretionEngine engineImpl = new AccretionEngine();
        factory = new IndexFactory(
            address(indexImpl), address(engineImpl), address(usdc), launcher, treasury, address(adapter), admin
        );

        vm.startPrank(admin);
        factory.approveAsset(address(tNVDA), address(nvdaFeed));
        factory.approveAsset(address(tMSFT), address(msftFeed));
        vm.stopPrank();

        zap = new IndexZapRouter(factory, address(usdc), address(adapter), admin);

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        vm.prank(launcher);
        (address indexAddr,) = factory.createIndex(
            IndexFactory.CreateIndexParams({
                name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
            })
        );
        index = AccretiveIndex(indexAddr);

        // Seed vault
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2.5e18;
        amounts[1] = 1.0e18;
        tNVDA.mint(launcher, amounts[0]);
        tMSFT.mint(launcher, amounts[1]);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), amounts[0]);
        tMSFT.approve(address(index), amounts[1]);
        index.seed(amounts, 1000e18, creator);
        vm.stopPrank();
    }

    function test_buyTargetBasket_50_50() public {
        uint256 usdcIn = 100e6;
        usdc.mint(user, usdcIn);

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        uint256[] memory minOut = new uint256[](2);

        vm.startPrank(user);
        usdc.approve(address(zap), usdcIn);
        uint256[] memory out = zap.buyTargetBasket(cons, w, usdcIn, minOut, block.timestamp + 1);
        vm.stopPrank();

        // 50 USDC → 0.25 tNVDA; 50 → 0.1 tMSFT
        assertEq(out[0], 0.25e18);
        assertEq(out[1], 0.1e18);
        assertEq(tNVDA.balanceOf(user), 0.25e18);
        assertEq(tMSFT.balanceOf(user), 0.1e18);
        assertEq(usdc.balanceOf(user), 0);
    }

    function test_buyTargetBasket_revertsBadWeights() public {
        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 4000;
        w[1] = 5000;
        uint256[] memory minOut = new uint256[](2);
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(zap), 10e6);
        vm.expectRevert(IndexZapRouter.InvalidWeights.selector);
        zap.buyTargetBasket(cons, w, 10e6, minOut, block.timestamp + 1);
        vm.stopPrank();
    }

    function test_buyTargetBasket_revertsDeadline() public {
        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        uint256[] memory minOut = new uint256[](2);
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(zap), 10e6);
        vm.expectRevert(IndexZapRouter.DeadlineExpired.selector);
        zap.buyTargetBasket(cons, w, 10e6, minOut, block.timestamp - 1);
        vm.stopPrank();
    }
}
