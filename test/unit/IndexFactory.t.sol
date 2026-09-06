// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {IndexFactory} from "../../src/core/IndexFactory.sol";
import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../../src/accretion/AccretionEngine.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";
import {MockSwapAdapter} from "../mocks/MockSwapAdapter.sol";

contract IndexFactoryTest is Test {
    IndexFactory public factory;
    AccretiveIndex public indexImpl;
    AccretionEngine public engineImpl;
    MockERC20 public usdc;
    MockERC20 public tNVDA;
    MockERC20 public tMSFT;
    MockPriceFeed public nvdaFeed;
    MockPriceFeed public msftFeed;
    MockSwapAdapter public adapter;

    address public admin = makeAddr("admin");
    address public launcher = makeAddr("launcher");
    address public treasury = makeAddr("treasury");
    address public creator = makeAddr("creator");
    address public stranger = makeAddr("stranger");

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        tNVDA = new MockERC20("Test NVDA", "tNVDA", 18);
        tMSFT = new MockERC20("Test MSFT", "tMSFT", 18);
        nvdaFeed = new MockPriceFeed("tNVDA/USD", 200_00000000);
        msftFeed = new MockPriceFeed("tMSFT/USD", 500_00000000);
        adapter = new MockSwapAdapter();

        indexImpl = new AccretiveIndex();
        engineImpl = new AccretionEngine();

        factory = new IndexFactory(
            address(indexImpl), address(engineImpl), address(usdc), launcher, treasury, address(adapter), admin
        );

        vm.startPrank(admin);
        factory.approveAsset(address(tNVDA), address(nvdaFeed));
        factory.approveAsset(address(tMSFT), address(msftFeed));
        vm.stopPrank();
    }

    function _params() internal view returns (IndexFactory.CreateIndexParams memory p) {
        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        p = IndexFactory.CreateIndexParams({
            name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
        });
    }

    function test_createIndex_happy() public {
        vm.prank(launcher);
        (address index, address engine) = factory.createIndex(_params());

        assertTrue(factory.isIndex(index));
        assertTrue(factory.isEngine(engine));
        assertEq(factory.engineOf(index), engine);
        assertEq(factory.indexCount(), 1);
        assertEq(factory.indexAt(0), index);

        AccretiveIndex idx = AccretiveIndex(index);
        assertEq(idx.name(), "Index AI2");
        assertEq(idx.symbol(), "AI2");
        assertEq(idx.factory(), address(factory));
        assertEq(idx.launcher(), launcher);
        assertEq(idx.accretionEngine(), engine);
        assertEq(idx.protocolTreasury(), treasury);
        assertEq(idx.mintFeeBps(), 10);
        assertEq(idx.redeemFeeBps(), 10);
        assertEq(idx.constituentCount(), 2);
        assertFalse(idx.seeded());

        AccretionEngine eng = AccretionEngine(engine);
        assertEq(address(eng.index()), index);
        assertEq(eng.factory(), address(factory));
        assertEq(address(eng.usdc()), address(usdc));
        assertEq(address(eng.swapAdapter()), address(adapter));
        uint16[] memory weights = eng.launchWeightsBps();
        assertEq(weights.length, 2);
        assertEq(weights[0], 5000);
        assertEq(weights[1], 5000);
    }

    function test_createIndex_onlyLauncher() public {
        vm.prank(stranger);
        vm.expectRevert(IndexFactory.OnlyLauncher.selector);
        factory.createIndex(_params());
    }

    function test_createIndex_rejectsBadWeightSum() public {
        IndexFactory.CreateIndexParams memory p = _params();
        p.initialWeightsBps[0] = 4000;
        p.initialWeightsBps[1] = 5000; // sum 9000
        vm.prank(launcher);
        vm.expectRevert(IndexFactory.InvalidWeights.selector);
        factory.createIndex(p);
    }

    function test_createIndex_rejectsLengthMismatch() public {
        IndexFactory.CreateIndexParams memory p = _params();
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        p.initialWeightsBps = w;
        vm.prank(launcher);
        vm.expectRevert(IndexFactory.LengthMismatch.selector);
        factory.createIndex(p);
    }

    function test_createIndex_rejectsDuplicates() public {
        IndexFactory.CreateIndexParams memory p = _params();
        p.constituents[1] = address(tNVDA);
        vm.prank(launcher);
        vm.expectRevert(IndexFactory.DuplicateConstituent.selector);
        factory.createIndex(p);
    }

    function test_createIndex_rejectsUnapproved() public {
        MockERC20 other = new MockERC20("Other", "OTH", 18);
        IndexFactory.CreateIndexParams memory p = _params();
        p.constituents[1] = address(other);
        vm.prank(launcher);
        vm.expectRevert(abi.encodeWithSelector(IndexFactory.AssetNotApproved.selector, address(other)));
        factory.createIndex(p);
    }

    function test_createIndex_rejectsN1() public {
        IndexFactory.CreateIndexParams memory p = _params();
        address[] memory cons = new address[](1);
        cons[0] = address(tNVDA);
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        p.constituents = cons;
        p.initialWeightsBps = w;
        vm.prank(launcher);
        vm.expectRevert(IndexFactory.InvalidConstituentCount.selector);
        factory.createIndex(p);
    }

    function test_createIndex_rejectsN9() public {
        // approve 9 assets
        address[] memory cons = new address[](9);
        uint16[] memory w = new uint16[](9);
        for (uint256 i = 0; i < 9; ++i) {
            MockERC20 t = new MockERC20("T", "T", 18);
            MockPriceFeed f = new MockPriceFeed("T", 1e8);
            vm.prank(admin);
            factory.approveAsset(address(t), address(f));
            cons[i] = address(t);
            w[i] = i == 0 ? 2000 : 1000; // 2000+8*1000=10000
        }
        IndexFactory.CreateIndexParams memory p = IndexFactory.CreateIndexParams({
            name: "X", symbol: "X", constituents: cons, initialWeightsBps: w, creator: creator
        });
        vm.prank(launcher);
        vm.expectRevert(IndexFactory.InvalidConstituentCount.selector);
        factory.createIndex(p);
    }

    function test_approveAsset_guardianOnly() public {
        MockERC20 t = new MockERC20("T", "T", 18);
        MockPriceFeed f = new MockPriceFeed("T", 1e8);
        vm.prank(stranger);
        vm.expectRevert();
        factory.approveAsset(address(t), address(f));
    }

    function test_revokeAsset_blocksCreate() public {
        vm.prank(admin);
        factory.revokeAsset(address(tMSFT));
        assertFalse(factory.isApprovedAsset(address(tMSFT)));

        vm.prank(launcher);
        vm.expectRevert(abi.encodeWithSelector(IndexFactory.AssetNotApproved.selector, address(tMSFT)));
        factory.createIndex(_params());
    }

    function test_setPriceFeed() public {
        MockPriceFeed f2 = new MockPriceFeed("tNVDA/USD", 210_00000000);
        vm.prank(admin);
        factory.setPriceFeed(address(tNVDA), address(f2));
        assertEq(factory.priceFeedOf(address(tNVDA)), address(f2));
    }

    function test_implsCannotInitialize() public {
        address[] memory cons = new address[](2);
        cons[0] = address(tNVDA);
        cons[1] = address(tMSFT);
        vm.expectRevert();
        indexImpl.initialize("X", "X", cons, address(factory), launcher, address(1), treasury, 10, 10);

        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;
        // engine impl: index not initialized — but disableInitializers should revert first
        vm.expectRevert();
        engineImpl.initialize(address(1), address(factory), address(usdc), address(adapter), w);
    }
}
