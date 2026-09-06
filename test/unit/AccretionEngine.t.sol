// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IndexFactory} from "../../src/core/IndexFactory.sol";
import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../../src/accretion/AccretionEngine.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";
import {MockSwapAdapter} from "../mocks/MockSwapAdapter.sol";
import {NavLib} from "../../src/libs/NavLib.sol";

contract AccretionEngineTest is Test {
    using Math for uint256;

    IndexFactory public factory;
    AccretiveIndex public index;
    AccretionEngine public engine;
    MockERC20 public usdc;
    MockERC20 public tNVDA;
    MockERC20 public tMSFT;
    MockSwapAdapter public adapter;

    address public admin = makeAddr("admin");
    address public launcher = makeAddr("launcher");
    address public treasury = makeAddr("treasury");
    address public creator = makeAddr("creator");
    address public lp = makeAddr("lp");
    address public keeper = makeAddr("keeper");

    uint256 constant WAD = 1e18;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        tNVDA = new MockERC20("Test NVDA", "tNVDA", 18);
        tMSFT = new MockERC20("Test MSFT", "tMSFT", 18);
        MockPriceFeed nvdaFeed = new MockPriceFeed("tNVDA/USD", 200_00000000);
        MockPriceFeed msftFeed = new MockPriceFeed("tMSFT/USD", 500_00000000);
        adapter = new MockSwapAdapter();

        // Ideal rates (no slippage):
        // $200/tNVDA: 1e6 USDC → 0.005e18 tNVDA ⇒ outPerInWad = 0.005e18 * 1e18 / 1e6 = 5e27
        // $500/tMSFT: 1e6 USDC → 0.002e18 tMSFT ⇒ outPerInWad = 0.002e18 * 1e18 / 1e6 = 2e27
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

        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        vm.prank(launcher);
        (address indexAddr, address engineAddr) = factory.createIndex(
            IndexFactory.CreateIndexParams({
                name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
            })
        );
        index = AccretiveIndex(indexAddr);
        engine = AccretionEngine(engineAddr);

        // Seed: 2.5 tNVDA, 1.0 tMSFT, 1000 AI2
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2.5e18;
        amounts[1] = 1.0e18;
        tNVDA.mint(launcher, amounts[0]);
        tMSFT.mint(launcher, amounts[1]);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), amounts[0]);
        tMSFT.approve(address(index), amounts[1]);
        index.seed(amounts, 1000e18, lp);
        vm.stopPrank();
    }

    function test_harvest_50_50_proportional() public {
        // Fund engine with 100 USDC (6 dec)
        usdc.mint(address(engine), 100e6);

        uint256 supplyBefore = index.totalSupply();
        uint256 trackedNvdaBefore = index.trackedBalance(address(tNVDA));
        uint256 trackedMsftBefore = index.trackedBalance(address(tMSFT));

        // Ideal buys: 50 USDC → 0.25 tNVDA; 50 USDC → 0.1 tMSFT — exact tracked proportions
        uint256[] memory minOut = new uint256[](2);
        minOut[0] = 0;
        minOut[1] = 0;

        vm.prank(keeper);
        uint256[] memory recognized = engine.harvest(minOut, block.timestamp + 1);

        assertEq(index.totalSupply(), supplyBefore, "supply must stay flat");
        assertEq(recognized[0], 0.25e18);
        assertEq(recognized[1], 0.1e18);
        assertEq(index.trackedBalance(address(tNVDA)), trackedNvdaBefore + 0.25e18);
        assertEq(index.trackedBalance(address(tMSFT)), trackedMsftBefore + 0.1e18);

        // No leftover constituents in engine
        assertEq(tNVDA.balanceOf(address(engine)), 0);
        assertEq(tMSFT.balanceOf(address(engine)), 0);
        // All USDC spent (50/50 exact)
        assertEq(usdc.balanceOf(address(engine)), 0);

        assertEq(index.cumulativeAccretedRaw(address(tNVDA)), 0.25e18);
        assertEq(index.cumulativeAccretedRaw(address(tMSFT)), 0.1e18);
    }

    function test_harvest_worstLeg_leftoverStaysInEngine() public {
        usdc.mint(address(engine), 100e6);

        // Make tMSFT leg worse: half the ideal rate → 50 USDC buys only 0.05 tMSFT
        // Ideal tNVDA still 0.25. Tracked ratio 2.5:1 ⇒ scale limited by MSFT:
        // recognized = [0.125e18, 0.05e18]; leftover tNVDA 0.125e18 stays in engine.
        adapter.setOutPerInWad(address(usdc), address(tMSFT), 1e27); // half of 2e27

        uint256 supplyBefore = index.totalSupply();
        uint256 trackedNvdaBefore = index.trackedBalance(address(tNVDA));
        uint256 trackedMsftBefore = index.trackedBalance(address(tMSFT));

        uint256[] memory minOut = new uint256[](2);
        vm.prank(keeper);
        uint256[] memory recognized = engine.harvest(minOut, block.timestamp + 1);

        assertEq(index.totalSupply(), supplyBefore, "supply flat");
        assertEq(recognized[0], 0.125e18);
        assertEq(recognized[1], 0.05e18);
        assertEq(index.trackedBalance(address(tNVDA)), trackedNvdaBefore + 0.125e18);
        assertEq(index.trackedBalance(address(tMSFT)), trackedMsftBefore + 0.05e18);

        // Leftover tNVDA stays in engine; tMSFT fully recognized
        assertEq(tNVDA.balanceOf(address(engine)), 0.125e18);
        assertEq(tMSFT.balanceOf(address(engine)), 0);
    }

    function test_harvest_revertsDeadline() public {
        usdc.mint(address(engine), 100e6);
        uint256[] memory minOut = new uint256[](2);
        vm.warp(1000);
        vm.expectRevert(AccretionEngine.DeadlineExpired.selector);
        engine.harvest(minOut, 999);
    }

    function test_harvest_revertsNoUsdc() public {
        uint256[] memory minOut = new uint256[](2);
        vm.expectRevert(AccretionEngine.NoUsdc.selector);
        engine.harvest(minOut, block.timestamp + 1);
    }

    function test_harvest_permissionless() public {
        usdc.mint(address(engine), 100e6);
        uint256[] memory minOut = new uint256[](2);
        // any EOA
        vm.prank(makeAddr("anyone"));
        engine.harvest(minOut, block.timestamp + 1);
        assertEq(index.totalSupply(), 1000e18);
    }

    function test_harvest_increasesCumulativeAccretedUsdWad_supplyFlat() public {
        usdc.mint(address(engine), 100e6);

        uint256 supplyBefore = index.totalSupply();
        uint256 usdBefore = index.cumulativeAccretedUsdWad();

        uint256[] memory minOut = new uint256[](2);
        vm.prank(keeper);
        uint256[] memory recognized = engine.harvest(minOut, block.timestamp + 1);

        // Ideal: 0.25 tNVDA @ $200 + 0.1 tMSFT @ $500 = $50 + $50 = $100 = 100e18 WAD
        int256[] memory answers = new int256[](2);
        answers[0] = 200_00000000;
        answers[1] = 500_00000000;
        uint256 expectedUsd = NavLib.navWad(recognized, 18, answers, 8);
        assertEq(expectedUsd, 100e18);

        assertEq(index.totalSupply(), supplyBefore, "supply must stay flat");
        assertEq(index.cumulativeAccretedUsdWad(), usdBefore + expectedUsd);
        assertGt(index.cumulativeAccretedUsdWad(), 0);
    }
}
