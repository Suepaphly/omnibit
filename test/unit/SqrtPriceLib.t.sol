// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqrtPriceLib} from "../../src/libs/SqrtPriceLib.sol";

contract SqrtPriceLibHarness {
    function atOneDollar(address index, address usdc, uint8 d0, uint8 d1) external pure returns (uint160) {
        return SqrtPriceLib.sqrtPriceX96AtOneDollar(index, usdc, d0, d1);
    }

    function fromNav(address index, address usdc, uint8 d0, uint8 d1, uint256 nav) external pure returns (uint160) {
        return SqrtPriceLib.sqrtPriceX96FromNav(index, usdc, d0, d1, nav);
    }
}

contract SqrtPriceLibTest is Test {
    SqrtPriceLibHarness internal harness;

    function setUp() public {
        harness = new SqrtPriceLibHarness();
    }

    function test_encodeSqrtPriceX96_oneToOne() public pure {
        uint160 sp = SqrtPriceLib.encodeSqrtPriceX96(1e18, 1e18);
        assertEq(uint256(sp), uint256(1) << 96);
    }

    function test_sqrtPriceAtOneDollar_indexAsToken0() public pure {
        address index = address(0x1000);
        address usdc = address(0x2000);
        uint160 sp = SqrtPriceLib.sqrtPriceX96AtOneDollar(index, usdc, 18, 6);
        uint160 expected = SqrtPriceLib.encodeSqrtPriceX96(1e18, 1e6);
        assertEq(sp, expected);
        assertTrue(SqrtPriceLib.isCurrency0(index, usdc));
    }

    function test_sqrtPriceAtOneDollar_usdcAsToken0() public pure {
        address usdc = address(0x1000);
        address index = address(0x2000);
        uint160 sp = SqrtPriceLib.sqrtPriceX96AtOneDollar(index, usdc, 18, 6);
        uint160 expected = SqrtPriceLib.encodeSqrtPriceX96(1e6, 1e18);
        assertEq(sp, expected);
        assertFalse(SqrtPriceLib.isCurrency0(index, usdc));
    }

    function test_revert_zeroNav() public {
        vm.expectRevert(SqrtPriceLib.ZeroNav.selector);
        harness.fromNav(address(1), address(2), 18, 6, 0);
    }

    function test_revert_identical() public {
        vm.expectRevert(SqrtPriceLib.IdenticalCurrencies.selector);
        harness.atOneDollar(address(1), address(1), 18, 6);
    }
}
