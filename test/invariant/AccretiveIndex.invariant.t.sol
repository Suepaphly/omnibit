// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev Handler that only exercises intended entrypoints (and donations / seizes for negative paths).
contract AccretiveIndexHandler is Test {
    AccretiveIndex public index;
    MockERC20 public a;
    MockERC20 public b;

    address public launcher;
    address public engine;
    address public treasury;
    address public lp;
    address public user;

    uint256 public ghostSupplyFromSeed;
    uint256 public ghostSupplyMinted;
    uint256 public ghostSupplyBurned;
    uint256 public ghostAccretionCalls;
    uint256 public ghostTrackedDecreasesViaSync;
    uint256 public ghostDonations;

    constructor(
        AccretiveIndex index_,
        MockERC20 a_,
        MockERC20 b_,
        address launcher_,
        address engine_,
        address treasury_,
        address lp_,
        address user_
    ) {
        index = index_;
        a = a_;
        b = b_;
        launcher = launcher_;
        engine = engine_;
        treasury = treasury_;
        lp = lp_;
        user = user_;
    }

    function mint(uint256 grossShares) external {
        if (!index.seeded() || index.mintPaused()) return;
        grossShares = bound(grossShares, 1, 1e20);
        try index.previewMint(grossShares) returns (uint256[] memory req, uint256, uint256) {
            a.mint(user, req[0]);
            b.mint(user, req[1]);
            vm.startPrank(user);
            a.approve(address(index), req[0]);
            b.approve(address(index), req[1]);
            try index.mintExactShares(grossShares, user) returns (uint256, uint256) {
                ghostSupplyMinted += grossShares;
            } catch {}
            vm.stopPrank();
        } catch {}
    }

    function redeem(uint256 sharesIn) external {
        if (!index.seeded()) return;
        uint256 bal = index.balanceOf(user);
        if (bal == 0) {
            // move some from lp if available
            uint256 lpBal = index.balanceOf(lp);
            if (lpBal == 0) return;
            uint256 move = bound(sharesIn, 1, lpBal);
            vm.prank(lp);
            index.transfer(user, move);
            bal = index.balanceOf(user);
        }
        sharesIn = bound(sharesIn, 1, bal);
        uint256 supplyBefore = index.totalSupply();
        vm.prank(user);
        try index.redeem(sharesIn, user) returns (uint256[] memory) {
            ghostSupplyBurned += supplyBefore - index.totalSupply();
        } catch {}
    }

    function accrete(uint256 amtA, uint256 amtB) external {
        if (!index.seeded()) return;
        amtA = bound(amtA, 0, 1e20);
        amtB = bound(amtB, 0, 1e20);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amtA;
        amounts[1] = amtB;
        if (amtA > 0) a.mint(engine, amtA);
        if (amtB > 0) b.mint(engine, amtB);
        vm.startPrank(engine);
        a.approve(address(index), amtA);
        b.approve(address(index), amtB);
        uint256 supplyBefore = index.totalSupply();
        try index.depositAccretion(amounts, 0) {
            ghostAccretionCalls += 1;
            require(index.totalSupply() == supplyBefore, "accretion minted");
        } catch {}
        vm.stopPrank();
    }

    function donate(uint256 amt) external {
        amt = bound(amt, 1, 1e20);
        uint256 trackedBefore = index.trackedBalance(address(a));
        a.mint(address(index), amt);
        ghostDonations += amt;
        require(index.trackedBalance(address(a)) == trackedBefore, "donation tracked");
    }

    function seizeAndSync(uint256 burnAmt) external {
        if (!index.seeded()) return;
        uint256 raw = a.balanceOf(address(index));
        if (raw == 0) return;
        burnAmt = bound(burnAmt, 1, raw);
        uint256 trackedBefore = index.trackedBalance(address(a));
        a.burn(address(index), burnAmt);
        index.syncLoss(address(a));
        uint256 trackedAfter = index.trackedBalance(address(a));
        require(trackedAfter <= trackedBefore, "sync increased");
        if (trackedAfter < trackedBefore) {
            ghostTrackedDecreasesViaSync += 1;
        }
    }
}

contract AccretiveIndexInvariantTest is StdInvariant, Test {
    AccretiveIndex public index;
    MockERC20 public a;
    MockERC20 public b;
    AccretiveIndexHandler public handler;

    address public launcher = makeAddr("launcher");
    address public engine = makeAddr("engine");
    address public treasury = makeAddr("treasury");
    address public lp = makeAddr("lp");
    address public user = makeAddr("user");

    function setUp() public {
        a = new MockERC20("A", "A", 18);
        b = new MockERC20("B", "B", 18);
        AccretiveIndex impl = new AccretiveIndex();
        index = AccretiveIndex(Clones.clone(address(impl)));
        address[] memory c = new address[](2);
        c[0] = address(a);
        c[1] = address(b);
        index.initialize("IDX", "IDX", c, makeAddr("factory"), launcher, engine, treasury, 10, 10);

        // Seed once in setUp so invariants always have a live vault
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2.5e18;
        amounts[1] = 1.0e18;
        a.mint(launcher, amounts[0]);
        b.mint(launcher, amounts[1]);
        vm.startPrank(launcher);
        a.approve(address(index), amounts[0]);
        b.approve(address(index), amounts[1]);
        index.seed(amounts, 1000e18, lp);
        vm.stopPrank();

        handler = new AccretiveIndexHandler(index, a, b, launcher, engine, treasury, lp, user);
        targetContract(address(handler));
    }

    function invariant_trackedLeRaw() public view {
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(b)), b.balanceOf(address(index)));
    }

    function invariant_donationsDoNotTrack() public view {
        // raw - tracked == untracked (donations + any unpaid rounding dust from seizes repaired)
        // Strong form: tracked never exceeds raw (covered above). Donation ghost checked in handler.
        assertTrue(a.balanceOf(address(index)) >= index.trackedBalance(address(a)));
    }

    function invariant_accretionKeepsSupplyConsistentWithMintsBurns() public view {
        // totalSupply == seed + minted - burned (handler ghosts). Seed fixed at 1000e18.
        uint256 expected = 1000e18 + handler.ghostSupplyMinted() - handler.ghostSupplyBurned();
        assertEq(index.totalSupply(), expected);
    }

    function invariant_syncLossNeverIncreasesTrackedBeyondRaw() public view {
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
    }

    function invariant_treasurySharesFullyBackedIfAny() public view {
        uint256 tBal = index.balanceOf(treasury);
        if (tBal == 0 || index.totalSupply() == 0) return;
        // Treasury fee shares are ordinary INDEX balances; solvency requires tracked <= raw
        // so a redeem of treasury shares is claimable pro-rata of recognized backing.
        assertLe(tBal, index.totalSupply());
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(b)), b.balanceOf(address(index)));
    }

    /// @dev Handler deposits with usdWadIncrement=0 (no factory feeds in this harness).
    ///      Harvest-path UsdWad updates are covered in AccretionEngine unit + integration tests.
    function invariant_cumulativeUsdWadNonNegativeWhenHandlerPassesZero() public view {
        assertEq(index.cumulativeAccretedUsdWad(), 0);
    }
}
