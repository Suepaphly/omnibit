// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {NavLib} from "../../src/libs/NavLib.sol";
import {MockPriceFeed} from "../../src/testnet/MockPriceFeed.sol";

/// @dev External wrappers so expectRevert sees a lower call depth (NavLib fns are internal/inlined).
contract NavLibHarness {
    function usdValueWad(uint256 amount, uint8 amountDecimals, int256 feedAnswer, uint8 feedDecimals)
        external
        pure
        returns (uint256)
    {
        return NavLib.usdValueWad(amount, amountDecimals, feedAnswer, feedDecimals);
    }

    function navWad(uint256[] memory amounts, uint8 amountDecimals, int256[] memory feedAnswers, uint8 feedDecimals)
        external
        pure
        returns (uint256)
    {
        return NavLib.navWad(amounts, amountDecimals, feedAnswers, feedDecimals);
    }

    function navPerShareWad(uint256 navWad_, uint256 totalSupply) external pure returns (uint256) {
        return NavLib.navPerShareWad(navWad_, totalSupply);
    }
}

contract NavLibTest is Test {
    MockPriceFeed public nvdaFeed;
    MockPriceFeed public msftFeed;
    NavLibHarness public harness;

    function setUp() public {
        nvdaFeed = new MockPriceFeed("tNVDA/USD", 200_00000000);
        msftFeed = new MockPriceFeed("tMSFT/USD", 500_00000000);
        harness = new NavLibHarness();
    }

    function test_mockPriceFeedDecimals8() public view {
        assertEq(nvdaFeed.decimals(), 8);
        (, int256 ans,, uint256 updatedAt,) = nvdaFeed.latestRoundData();
        assertEq(ans, 200_00000000);
        assertEq(updatedAt, block.timestamp);
    }

    function test_mockPriceFeedSetAnswer() public {
        nvdaFeed.setAnswer(250_00000000);
        (, int256 ans,,,) = nvdaFeed.latestRoundData();
        assertEq(ans, 250_00000000);
    }

    function test_usdValueWad_nvda() public view {
        // 2.5e18 tNVDA @ $200 → $500 = 500e18 WAD
        uint256 v = harness.usdValueWad(2.5e18, 18, 200_00000000, 8);
        assertEq(v, 500e18);
    }

    function test_usdValueWad_msft() public view {
        uint256 v = harness.usdValueWad(1e18, 18, 500_00000000, 8);
        assertEq(v, 500e18);
    }

    function test_navWad_ai2Fixture() public view {
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 2.5e18;
        amounts[1] = 1e18;
        int256[] memory answers = new int256[](2);
        answers[0] = 200_00000000;
        answers[1] = 500_00000000;
        uint256 nav = harness.navWad(amounts, 18, answers, 8);
        assertEq(nav, 1000e18);
    }

    function test_navPerShareWad() public view {
        assertEq(harness.navPerShareWad(1000e18, 1000e18), 1e18);
    }

    function test_navPerShareWad_revertsZeroSupply() public {
        vm.expectRevert(NavLib.ZeroSupply.selector);
        harness.navPerShareWad(1000e18, 0);
    }

    function test_usdValueWad_revertsNonPositive() public {
        vm.expectRevert(NavLib.NonPositiveFeed.selector);
        harness.usdValueWad(1e18, 18, 0, 8);

        vm.expectRevert(NavLib.NonPositiveFeed.selector);
        harness.usdValueWad(1e18, 18, -1, 8);
    }

    function test_navWad_lengthMismatch() public {
        uint256[] memory amounts = new uint256[](2);
        int256[] memory answers = new int256[](1);
        answers[0] = 1;
        vm.expectRevert(NavLib.LengthMismatch.selector);
        harness.navWad(amounts, 18, answers, 8);
    }
}
