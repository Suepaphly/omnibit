// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {AccretiveIndex} from "../../src/core/AccretiveIndex.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract AccretiveIndexFuzzTest is Test {
    AccretiveIndex public index;
    MockERC20 public a;
    MockERC20 public b;

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
    }

    function _seed(uint256 amtA, uint256 amtB, uint256 shares) internal {
        amtA = bound(amtA, 1e6, 1e24);
        amtB = bound(amtB, 1e6, 1e24);
        shares = bound(shares, 1e6, 1e24);

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = amtA;
        amounts[1] = amtB;
        a.mint(launcher, amtA);
        b.mint(launcher, amtB);
        vm.startPrank(launcher);
        a.approve(address(index), amtA);
        b.approve(address(index), amtB);
        index.seed(amounts, shares, lp);
        vm.stopPrank();
    }

    function testFuzz_mintPreviewMatchesExecution(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 gross)
        public
    {
        _seed(seedA, seedB, seedShares);
        gross = bound(gross, 1, index.totalSupply()); // keep required amounts reasonable

        (uint256[] memory req, uint256 previewUser, uint256 previewFee) = index.previewMint(gross);
        a.mint(user, req[0]);
        b.mint(user, req[1]);
        vm.startPrank(user);
        a.approve(address(index), req[0]);
        b.approve(address(index), req[1]);
        (uint256 userShares, uint256 feeShares) = index.mintExactShares(gross, user);
        vm.stopPrank();

        assertEq(userShares, previewUser);
        assertEq(feeShares, previewFee);
        assertEq(userShares + feeShares, gross);
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(b)), b.balanceOf(address(index)));
    }

    function testFuzz_redeemPreviewMatchesExecution(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 sharesIn)
        public
    {
        _seed(seedA, seedB, seedShares);
        sharesIn = bound(sharesIn, 1, index.balanceOf(lp));

        (uint256[] memory previewOut, uint256 previewRedeem, uint256 previewFee) = index.previewRedeem(sharesIn);

        uint256 balA = a.balanceOf(user);
        vm.prank(lp);
        uint256[] memory out = index.redeem(sharesIn, user);

        assertEq(out[0], previewOut[0]);
        assertEq(out[1], previewOut[1]);
        assertEq(previewRedeem + previewFee, sharesIn);
        assertEq(a.balanceOf(user), balA + out[0]);
        // redeem assets <= pro-rata of tracked before (floor)
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(b)), b.balanceOf(address(index)));
    }

    function testFuzz_accretionDoesNotChangeSupply(
        uint256 seedA,
        uint256 seedB,
        uint256 seedShares,
        uint256 accA,
        uint256 accB
    ) public {
        _seed(seedA, seedB, seedShares);
        accA = bound(accA, 0, 1e22);
        accB = bound(accB, 0, 1e22);
        uint256 supplyBefore = index.totalSupply();

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = accA;
        amounts[1] = accB;
        if (accA > 0) a.mint(engine, accA);
        if (accB > 0) b.mint(engine, accB);
        vm.startPrank(engine);
        a.approve(address(index), accA);
        b.approve(address(index), accB);
        index.depositAccretion(amounts, 0);
        vm.stopPrank();

        assertEq(index.totalSupply(), supplyBefore);
        assertEq(index.cumulativeAccretedRaw(address(a)), accA);
        assertEq(index.cumulativeAccretedRaw(address(b)), accB);
        assertLe(index.trackedBalance(address(a)), a.balanceOf(address(index)));
        assertLe(index.trackedBalance(address(b)), b.balanceOf(address(index)));
    }

    function testFuzz_syncLossNeverIncreases(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 burnAmt) public {
        _seed(seedA, seedB, seedShares);
        uint256 trackedBefore = index.trackedBalance(address(a));
        burnAmt = bound(burnAmt, 0, a.balanceOf(address(index)));

        // Donation first — must not become tracked via syncLoss
        a.mint(address(index), 12345);
        index.syncLoss(address(a));
        assertEq(index.trackedBalance(address(a)), trackedBefore);

        if (burnAmt > 0) {
            a.burn(address(index), burnAmt);
        }
        uint256 raw = a.balanceOf(address(index));
        index.syncLoss(address(a));
        uint256 trackedAfter = index.trackedBalance(address(a));
        assertLe(trackedAfter, trackedBefore);
        if (raw < trackedBefore) {
            assertEq(trackedAfter, raw);
        } else {
            assertEq(trackedAfter, trackedBefore);
        }
    }

    function testFuzz_mintCeilAtLeastProRata(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 gross) public {
        _seed(seedA, seedB, seedShares);
        gross = bound(gross, 1, 1e20);
        uint256 supply = index.totalSupply();
        uint256 tracked = index.trackedBalance(address(a));
        (uint256[] memory req,,) = index.previewMint(gross);
        // ceil >= floor
        uint256 floor_ = Math.mulDiv(tracked, gross, supply, Math.Rounding.Floor);
        assertGe(req[0], floor_);
        // ceil - floor is 0 or 1 for this form when no overflow
        if (tracked > 0 && gross > 0) {
            assertLe(req[0] - floor_, 1);
        }
    }

    function testFuzz_redeemFloorAtMostProRata(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 sharesIn)
        public
    {
        _seed(seedA, seedB, seedShares);
        sharesIn = bound(sharesIn, 1, index.totalSupply());
        uint256 supply = index.totalSupply();
        uint256 fee = (sharesIn * 10) / 10_000;
        uint256 redeemShares = sharesIn - fee;
        uint256 tracked = index.trackedBalance(address(a));
        (uint256[] memory out,,) = index.previewRedeem(sharesIn);
        // assetOut <= tracked * redeemShares / supply (exact floor)
        assertEq(out[0], Math.mulDiv(tracked, redeemShares, supply, Math.Rounding.Floor));
        assertLe(out[0] * supply, tracked * redeemShares);
    }

    function testFuzz_donationNeverIncreasesTracked(uint256 seedA, uint256 seedB, uint256 seedShares, uint256 donation)
        public
    {
        _seed(seedA, seedB, seedShares);
        donation = bound(donation, 1, 1e24);
        uint256 trackedBefore = index.trackedBalance(address(a));
        a.mint(address(index), donation);
        assertEq(index.trackedBalance(address(a)), trackedBefore);
        assertLe(trackedBefore, a.balanceOf(address(index)));
    }
}
