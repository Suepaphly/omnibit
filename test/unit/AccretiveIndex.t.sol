// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract AccretiveIndexTest is Test {
    using Math for uint256;

    uint16 constant MINT_FEE_BPS = 10;
    uint16 constant REDEEM_FEE_BPS = 10;
    uint16 constant MAX_BPS = 10_000;

    AccretiveIndex public impl;
    AccretiveIndex public index;

    MockERC20 public tNVDA;
    MockERC20 public tMSFT;

    address public factory = makeAddr("factory");
    address public launcher = makeAddr("launcher");
    address public engine = makeAddr("engine");
    address public treasury = makeAddr("treasury");
    address public lp = makeAddr("lp");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        tNVDA = new MockERC20("Test NVDA", "tNVDA", 18);
        tMSFT = new MockERC20("Test MSFT", "tMSFT", 18);

        impl = new AccretiveIndex();
        index = AccretiveIndex(Clones.clone(address(impl)));

        address[] memory constituents = new address[](2);
        constituents[0] = address(tNVDA);
        constituents[1] = address(tMSFT);

        index.initialize(
            "Index AI2", "AI2", constituents, factory, launcher, engine, treasury, MINT_FEE_BPS, REDEEM_FEE_BPS
        );
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _seedDefault() internal {
        // Fixture: 2.5e18 tNVDA, 1.0e18 tMSFT, 1000e18 AI2
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

    function _fundAndApprove(address who, uint256 nvdaAmt, uint256 msftAmt) internal {
        tNVDA.mint(who, nvdaAmt);
        tMSFT.mint(who, msftAmt);
        vm.startPrank(who);
        tNVDA.approve(address(index), type(uint256).max);
        tMSFT.approve(address(index), type(uint256).max);
        vm.stopPrank();
    }

    function _expectedMintRequired(uint256 grossShares)
        internal
        view
        returns (uint256[] memory required, uint256 userShares, uint256 feeShares)
    {
        uint256 supply = index.totalSupply();
        required = new uint256[](2);
        required[0] = Math.mulDiv(index.trackedBalance(address(tNVDA)), grossShares, supply, Math.Rounding.Ceil);
        required[1] = Math.mulDiv(index.trackedBalance(address(tMSFT)), grossShares, supply, Math.Rounding.Ceil);
        feeShares = (grossShares * uint256(MINT_FEE_BPS)) / uint256(MAX_BPS);
        userShares = grossShares - feeShares;
    }

    function _expectedRedeem(uint256 sharesIn)
        internal
        view
        returns (uint256[] memory assetOut, uint256 redeemShares, uint256 feeShares)
    {
        uint256 supply = index.totalSupply();
        feeShares = (sharesIn * uint256(REDEEM_FEE_BPS)) / uint256(MAX_BPS);
        redeemShares = sharesIn - feeShares;
        assetOut = new uint256[](2);
        assetOut[0] = Math.mulDiv(index.trackedBalance(address(tNVDA)), redeemShares, supply, Math.Rounding.Floor);
        assetOut[1] = Math.mulDiv(index.trackedBalance(address(tMSFT)), redeemShares, supply, Math.Rounding.Floor);
    }

    function _assertTrackedLeRaw() internal view {
        assertLe(index.trackedBalance(address(tNVDA)), tNVDA.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(tMSFT)), tMSFT.balanceOf(address(index)));
    }

    /// @dev mintPaused packs at slot 7 offset 25 (see forge inspect storageLayout).
    function _setMintPaused(bool paused) internal {
        bytes32 slot = bytes32(uint256(7));
        uint256 word = uint256(vm.load(address(index), slot));
        uint256 bit = uint256(1) << (25 * 8); // bool at byte offset 25
        if (paused) {
            word |= bit;
        } else {
            word &= ~bit;
        }
        vm.store(address(index), slot, bytes32(word));
    }

    // =========================================================================
    // Init
    // =========================================================================

    function test_implCannotInitialize() public {
        address[] memory constituents = new address[](2);
        constituents[0] = address(tNVDA);
        constituents[1] = address(tMSFT);

        vm.expectRevert(); // InvalidInitialization
        impl.initialize("X", "X", constituents, factory, launcher, engine, treasury, MINT_FEE_BPS, REDEEM_FEE_BPS);
    }

    function test_cloneInitializesOk() public view {
        assertEq(index.name(), "Index AI2");
        assertEq(index.symbol(), "AI2");
        assertEq(index.decimals(), 18);
        assertEq(index.factory(), factory);
        assertEq(index.launcher(), launcher);
        assertEq(index.accretionEngine(), engine);
        assertEq(index.protocolTreasury(), treasury);
        assertEq(index.mintFeeBps(), MINT_FEE_BPS);
        assertEq(index.redeemFeeBps(), REDEEM_FEE_BPS);
        assertFalse(index.seeded());
        assertEq(index.constituentCount(), 2);
        assertTrue(index.isConstituent(address(tNVDA)));
        assertTrue(index.isConstituent(address(tMSFT)));
    }

    function test_noDoubleInit() public {
        address[] memory constituents = new address[](2);
        constituents[0] = address(tNVDA);
        constituents[1] = address(tMSFT);
        vm.expectRevert();
        index.initialize("X", "X", constituents, factory, launcher, engine, treasury, MINT_FEE_BPS, REDEEM_FEE_BPS);
    }

    function test_initRevertsZeroFactory() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.ZeroAddress.selector);
        clone_.initialize("A", "A", c, address(0), launcher, engine, treasury, 10, 10);
    }

    function test_initRevertsZeroLauncher() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.ZeroAddress.selector);
        clone_.initialize("A", "A", c, factory, address(0), engine, treasury, 10, 10);
    }

    function test_initRevertsZeroEngine() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.ZeroAddress.selector);
        clone_.initialize("A", "A", c, factory, launcher, address(0), treasury, 10, 10);
    }

    function test_initRevertsZeroTreasury() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.ZeroAddress.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, address(0), 10, 10);
    }

    function test_initRevertsOneConstituent() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](1);
        c[0] = address(tNVDA);
        vm.expectRevert(AccretiveIndex.InvalidConstituentCount.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 10, 10);
    }

    function test_initRevertsNineConstituents() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](9);
        for (uint256 i = 0; i < 9; ++i) {
            c[i] = address(uint160(i + 1));
        }
        vm.expectRevert(AccretiveIndex.InvalidConstituentCount.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 10, 10);
    }

    function test_initRevertsDuplicateConstituent() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tNVDA);
        vm.expectRevert(AccretiveIndex.DuplicateConstituent.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 10, 10);
    }

    function test_initRevertsZeroConstituent() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(0);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.ZeroConstituent.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 10, 10);
    }

    function test_initRevertsFeeOverMax() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(tNVDA);
        c[1] = address(tMSFT);
        vm.expectRevert(AccretiveIndex.InvalidFeeBps.selector);
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 10_001, 10);
    }

    function test_initAcceptsEightConstituents() public {
        AccretiveIndex clone_ = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](8);
        for (uint256 i = 0; i < 8; ++i) {
            c[i] = address(new MockERC20("T", "T", 18));
        }
        clone_.initialize("A", "A", c, factory, launcher, engine, treasury, 0, 0);
        assertEq(clone_.constituentCount(), 8);
    }

    // =========================================================================
    // Seed
    // =========================================================================

    function test_seedHappyPath() public {
        _seedDefault();
        assertTrue(index.seeded());
        assertEq(index.totalSupply(), 1000e18);
        assertEq(index.balanceOf(lp), 1000e18);
        assertEq(index.balanceOf(treasury), 0);
        assertEq(index.trackedBalance(address(tNVDA)), 2.5e18);
        assertEq(index.trackedBalance(address(tMSFT)), 1.0e18);
        assertEq(tNVDA.balanceOf(address(index)), 2.5e18);
        assertEq(tMSFT.balanceOf(address(index)), 1.0e18);
        _assertTrackedLeRaw();
    }

    function test_seedOnlyLauncher() public {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        tNVDA.mint(alice, 1e18);
        tMSFT.mint(alice, 1e18);
        vm.startPrank(alice);
        tNVDA.approve(address(index), 1e18);
        tMSFT.approve(address(index), 1e18);
        vm.expectRevert(AccretiveIndex.OnlyLauncher.selector);
        index.seed(amounts, 100e18, lp);
        vm.stopPrank();
    }

    function test_seedOnceOnly() public {
        _seedDefault();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;
        tNVDA.mint(launcher, 1);
        tMSFT.mint(launcher, 1);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), 1);
        tMSFT.approve(address(index), 1);
        vm.expectRevert(AccretiveIndex.AlreadySeeded.selector);
        index.seed(amounts, 1, lp);
        vm.stopPrank();
    }

    function test_seedZeroSharesReverts() public {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        tNVDA.mint(launcher, 1e18);
        tMSFT.mint(launcher, 1e18);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), 1e18);
        tMSFT.approve(address(index), 1e18);
        vm.expectRevert(AccretiveIndex.ZeroShares.selector);
        index.seed(amounts, 0, lp);
        vm.stopPrank();
    }

    function test_seedLengthMismatch() public {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;
        vm.prank(launcher);
        vm.expectRevert(AccretiveIndex.LengthMismatch.selector);
        index.seed(amounts, 100e18, lp);
    }

    function test_seedZeroReceiver() public {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        tNVDA.mint(launcher, 1e18);
        tMSFT.mint(launcher, 1e18);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), type(uint256).max);
        tMSFT.approve(address(index), type(uint256).max);
        vm.expectRevert(AccretiveIndex.ZeroReceiver.selector);
        index.seed(amounts, 100e18, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // Mint — fixture: mint 100e18 @10bps → 0.25e18 / 0.10e18 assets; 99.9e18 / 0.1e18
    // =========================================================================

    function test_mintExactShares_fixture() public {
        _seedDefault();
        // required = ceil(2.5e18 * 100e18 / 1000e18) = 0.25e18
        // required = ceil(1.0e18 * 100e18 / 1000e18) = 0.10e18
        // fee = floor(100e18 * 10 / 10000) = 0.1e18
        // user = 99.9e18
        uint256 gross = 100e18;
        (uint256[] memory req, uint256 user, uint256 fee) = _expectedMintRequired(gross);
        assertEq(req[0], 0.25e18);
        assertEq(req[1], 0.1e18);
        assertEq(user, 99.9e18);
        assertEq(fee, 0.1e18);

        _fundAndApprove(alice, req[0], req[1]);

        vm.prank(alice);
        (uint256 userShares, uint256 feeShares) = index.mintExactShares(gross, alice);

        assertEq(userShares, 99.9e18);
        assertEq(feeShares, 0.1e18);
        assertEq(index.balanceOf(alice), 99.9e18);
        assertEq(index.balanceOf(treasury), 0.1e18);
        assertEq(index.totalSupply(), 1100e18);
        assertEq(index.trackedBalance(address(tNVDA)), 2.5e18 + 0.25e18);
        assertEq(index.trackedBalance(address(tMSFT)), 1.0e18 + 0.1e18);
        _assertTrackedLeRaw();
    }

    function test_previewMintMatchesMint() public {
        _seedDefault();
        uint256 gross = 100e18;
        (uint256[] memory previewReq, uint256 previewUser, uint256 previewFee) = index.previewMint(gross);

        _fundAndApprove(alice, previewReq[0] + 1, previewReq[1] + 1);
        vm.prank(alice);
        (uint256 userShares, uint256 feeShares) = index.mintExactShares(gross, alice);

        assertEq(userShares, previewUser);
        assertEq(feeShares, previewFee);
        // Independently recompute
        assertEq(previewReq[0], 0.25e18);
        assertEq(previewReq[1], 0.1e18);
    }

    function test_mintCeilRounding_smallInts() public {
        // Seed with awkward numbers to force ceil
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000;
        amounts[1] = 1000;
        tNVDA.mint(launcher, 1000);
        tMSFT.mint(launcher, 1000);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), 1000);
        tMSFT.approve(address(index), 1000);
        index.seed(amounts, 3, lp); // supply = 3
        vm.stopPrank();

        // gross = 2 → ceil(1000 * 2 / 3) = ceil(2000/3) = ceil(666.666) = 667
        uint256 expected = Math.mulDiv(1000, 2, 3, Math.Rounding.Ceil);
        assertEq(expected, 667);

        (uint256[] memory req,,) = index.previewMint(2);
        assertEq(req[0], 667);
        assertEq(req[1], 667);

        _fundAndApprove(alice, 667, 667);
        vm.prank(alice);
        index.mintExactShares(2, alice);
        assertEq(index.trackedBalance(address(tNVDA)), 1000 + 667);
        _assertTrackedLeRaw();
    }

    function test_mintRevertsNotSeeded() public {
        vm.expectRevert(AccretiveIndex.NotSeeded.selector);
        index.mintExactShares(1e18, alice);
    }

    function test_mintRevertsZeroShares() public {
        _seedDefault();
        vm.expectRevert(AccretiveIndex.ZeroShares.selector);
        index.mintExactShares(0, alice);
    }

    function test_mintRevertsZeroReceiver() public {
        _seedDefault();
        vm.expectRevert(AccretiveIndex.ZeroReceiver.selector);
        index.mintExactShares(1e18, address(0));
    }

    function test_mintPausedReverts() public {
        _seedDefault();
        _setMintPaused(true);
        assertTrue(index.mintPaused());
        assertTrue(index.seeded());

        (uint256[] memory req,,) = index.previewMint(1e18);
        _fundAndApprove(alice, req[0], req[1]);
        vm.prank(alice);
        vm.expectRevert(AccretiveIndex.MintPaused.selector);
        index.mintExactShares(1e18, alice);
    }

    // =========================================================================
    // Redeem
    // =========================================================================

    function test_redeemFixture() public {
        _seedDefault();
        // Alice mints first so she has shares
        uint256 gross = 100e18;
        (uint256[] memory req,,) = _expectedMintRequired(gross);
        _fundAndApprove(alice, req[0], req[1]);
        vm.prank(alice);
        index.mintExactShares(gross, alice);

        uint256 sharesIn = 50e18;
        (uint256[] memory expectedOut, uint256 redeemShares, uint256 feeShares) = _expectedRedeem(sharesIn);

        uint256 supplyBefore = index.totalSupply();
        uint256 trackedNvdaBefore = index.trackedBalance(address(tNVDA));
        uint256 aliceNvdaBefore = tNVDA.balanceOf(alice);

        vm.prank(alice);
        uint256[] memory out = index.redeem(sharesIn, alice);

        assertEq(out[0], expectedOut[0]);
        assertEq(out[1], expectedOut[1]);
        assertEq(index.balanceOf(treasury), 0.1e18 + feeShares); // prior mint fee + redeem fee
        assertEq(tNVDA.balanceOf(alice), aliceNvdaBefore + out[0]);
        assertEq(index.trackedBalance(address(tNVDA)), trackedNvdaBefore - out[0]);
        assertEq(index.totalSupply(), supplyBefore - redeemShares);
        _assertTrackedLeRaw();
    }

    function test_previewRedeemMatchesRedeem() public {
        _seedDefault();
        // Give lp shares path: lp already has 1000e18 from seed
        uint256 sharesIn = 100e18;
        (uint256[] memory previewOut, uint256 previewRedeem, uint256 previewFee) = index.previewRedeem(sharesIn);

        uint256 feeShares = (sharesIn * 10) / 10_000;
        uint256 redeemShares = sharesIn - feeShares;
        assertEq(previewFee, feeShares);
        assertEq(previewRedeem, redeemShares);
        // floor(2.5e18 * 99.9e18 / 1000e18) and floor(1e18 * 99.9e18 / 1000e18)
        assertEq(previewOut[0], Math.mulDiv(2.5e18, 99.9e18, 1000e18, Math.Rounding.Floor));
        assertEq(previewOut[1], Math.mulDiv(1.0e18, 99.9e18, 1000e18, Math.Rounding.Floor));

        vm.prank(lp);
        uint256[] memory out = index.redeem(sharesIn, bob);
        assertEq(out[0], previewOut[0]);
        assertEq(out[1], previewOut[1]);
        assertEq(tNVDA.balanceOf(bob), out[0]);
        assertEq(tMSFT.balanceOf(bob), out[1]);
    }

    function test_redeemFloorRounding_smallInts() public {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000;
        amounts[1] = 1000;
        tNVDA.mint(launcher, 1000);
        tMSFT.mint(launcher, 1000);
        vm.startPrank(launcher);
        tNVDA.approve(address(index), 1000);
        tMSFT.approve(address(index), 1000);
        index.seed(amounts, 3, lp);
        vm.stopPrank();

        // sharesIn = 2, fee = floor(2*10/10000)=0, redeemShares=2
        // floor(1000*2/3)=666
        (uint256[] memory out,,) = index.previewRedeem(2);
        assertEq(out[0], 666);
        assertEq(out[1], 666);

        vm.prank(lp);
        uint256[] memory got = index.redeem(2, alice);
        assertEq(got[0], 666);
        assertEq(index.trackedBalance(address(tNVDA)), 1000 - 666);
        _assertTrackedLeRaw();
    }

    function test_redeemWorksWhenMintPaused() public {
        _seedDefault();
        _setMintPaused(true);
        assertTrue(index.mintPaused());

        vm.prank(lp);
        index.redeem(10e18, alice);
        assertGt(tNVDA.balanceOf(alice), 0);
    }

    function test_redeemRevertsNotSeeded() public {
        vm.expectRevert(AccretiveIndex.NotSeeded.selector);
        index.redeem(1e18, alice);
    }

    // =========================================================================
    // Accretion
    // =========================================================================

    function test_depositAccretion_increasesBackingNotSupply() public {
        _seedDefault();
        uint256 supplyBefore = index.totalSupply();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 0.5e18;
        amounts[1] = 0.2e18;

        tNVDA.mint(engine, amounts[0]);
        tMSFT.mint(engine, amounts[1]);
        vm.startPrank(engine);
        tNVDA.approve(address(index), amounts[0]);
        tMSFT.approve(address(index), amounts[1]);
        index.depositAccretion(amounts);
        vm.stopPrank();

        assertEq(index.totalSupply(), supplyBefore);
        assertEq(index.trackedBalance(address(tNVDA)), 2.5e18 + 0.5e18);
        assertEq(index.trackedBalance(address(tMSFT)), 1.0e18 + 0.2e18);
        assertEq(index.cumulativeAccretedRaw(address(tNVDA)), 0.5e18);
        assertEq(index.cumulativeAccretedRaw(address(tMSFT)), 0.2e18);
        assertEq(index.cumulativeAccretedUsdWad(), 0); // unimplemented oracle update
        _assertTrackedLeRaw();

        // Backing per share rose
        // Before: 2.5e18/1000e18 = 0.0025; after: 3.0e18/1000e18 = 0.003
        assertEq(Math.mulDiv(index.trackedBalance(address(tNVDA)), 1e18, index.totalSupply()), 0.003e18);
    }

    function test_depositAccretionOnlyEngine() public {
        _seedDefault();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1;
        amounts[1] = 1;
        vm.prank(alice);
        vm.expectRevert(AccretiveIndex.OnlyAccretionEngine.selector);
        index.depositAccretion(amounts);
    }

    function test_depositAccretionNotSeeded() public {
        uint256[] memory amounts = new uint256[](2);
        vm.prank(engine);
        vm.expectRevert(AccretiveIndex.NotSeeded.selector);
        index.depositAccretion(amounts);
    }

    function test_depositAccretionLengthMismatch() public {
        _seedDefault();
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;
        vm.prank(engine);
        vm.expectRevert(AccretiveIndex.LengthMismatch.selector);
        index.depositAccretion(amounts);
    }

    // =========================================================================
    // syncLoss + donations
    // =========================================================================

    function test_donationDoesNotTrack() public {
        _seedDefault();
        uint256 trackedBefore = index.trackedBalance(address(tNVDA));
        tNVDA.mint(address(index), 5e18); // raw donation
        assertEq(index.trackedBalance(address(tNVDA)), trackedBefore);
        assertGt(tNVDA.balanceOf(address(index)), trackedBefore);
        _assertTrackedLeRaw();
    }

    function test_syncLossNeverIncreases() public {
        _seedDefault();
        uint256 trackedBefore = index.trackedBalance(address(tNVDA));
        // Donation
        tNVDA.mint(address(index), 1e18);
        index.syncLoss(address(tNVDA));
        assertEq(index.trackedBalance(address(tNVDA)), trackedBefore); // unchanged

        // Simulate seize: burn raw below tracked
        uint256 raw = tNVDA.balanceOf(address(index));
        // burn from vault via mock burn
        tNVDA.burn(address(index), raw - (trackedBefore - 100)); // leave trackedBefore - 100
        assertLt(tNVDA.balanceOf(address(index)), trackedBefore);

        index.syncLoss(address(tNVDA));
        assertEq(index.trackedBalance(address(tNVDA)), tNVDA.balanceOf(address(index)));
        assertLt(index.trackedBalance(address(tNVDA)), trackedBefore);
        _assertTrackedLeRaw();
    }

    function test_syncLossNotConstituent() public {
        _seedDefault();
        MockERC20 other = new MockERC20("X", "X", 18);
        vm.expectRevert(AccretiveIndex.NotConstituent.selector);
        index.syncLoss(address(other));
    }

    function test_syncLossPermissionless() public {
        _seedDefault();
        uint256 trackedBefore = index.trackedBalance(address(tMSFT));
        tMSFT.burn(address(index), 0.1e18);
        vm.prank(alice);
        index.syncLoss(address(tMSFT));
        assertEq(index.trackedBalance(address(tMSFT)), trackedBefore - 0.1e18);
    }

    // =========================================================================
    // Treasury fee shares remain backed (pro-rata claimable)
    // =========================================================================

    function test_treasuryFeeSharesBacked() public {
        _seedDefault();
        uint256 gross = 100e18;
        (uint256[] memory req,,) = _expectedMintRequired(gross);
        _fundAndApprove(alice, req[0], req[1]);
        vm.prank(alice);
        index.mintExactShares(gross, alice);

        uint256 treasuryShares = index.balanceOf(treasury);
        assertEq(treasuryShares, 0.1e18);

        (uint256[] memory out,,) = index.previewRedeem(treasuryShares);
        // Treasury can redeem its shares for positive assets
        assertGt(out[0], 0);
        assertGt(out[1], 0);

        vm.prank(treasury);
        index.redeem(treasuryShares, treasury);
        assertGt(tNVDA.balanceOf(treasury), 0);
        _assertTrackedLeRaw();
    }

    // =========================================================================
    // Post-accretion redeem gets more basket per share
    // =========================================================================

    function test_redeemAfterAccretionGetsMore() public {
        _seedDefault();

        uint256 shares = 100e18;
        (uint256[] memory outBefore,,) = index.previewRedeem(shares);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2.5e18; // double NVDA
        amounts[1] = 1.0e18; // double MSFT
        tNVDA.mint(engine, amounts[0]);
        tMSFT.mint(engine, amounts[1]);
        vm.startPrank(engine);
        tNVDA.approve(address(index), type(uint256).max);
        tMSFT.approve(address(index), type(uint256).max);
        index.depositAccretion(amounts);
        vm.stopPrank();

        (uint256[] memory outAfter,,) = index.previewRedeem(shares);
        assertGt(outAfter[0], outBefore[0]);
        assertGt(outAfter[1], outBefore[1]);
        assertEq(index.totalSupply(), 1000e18);
    }
}
