// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SqrtPriceLib
 * @notice Helpers for Uniswap V4 `sqrtPriceX96` initialization given INDEX/USDC decimals and NAV.
 *
 * @dev Currency sort (Uniswap V4 PoolKey rule):
 *      - `currency0` = lower address, `currency1` = higher address (numeric sort).
 *      - INDEX may be token0 OR token1 depending on clone address vs USDC.
 *      - `sqrtPriceX96` encodes the price of currency0 in units of currency1:
 *          price = amount1 / amount0   (raw token units)
 *          sqrtPriceX96 = sqrt(price) * 2^96
 *
 *      For target NAV `navPerShareWad` (WAD USD per one full INDEX share = 10^indexDecimals raw):
 *      - USDC raw for that share = navPerShareWad * 10^usdcDecimals / 1e18.
 *
 *      If INDEX < USDC (INDEX = currency0):
 *          encodeSqrtPriceX96(10^indexDec, usdcForOneShare)
 *      If USDC < INDEX (USDC = currency0):
 *          encodeSqrtPriceX96(usdcForOneShare, 10^indexDec)
 */
library SqrtPriceLib {
    using Math for uint256;

    uint256 internal constant WAD = 1e18;

    error ZeroAmount();
    error ZeroNav();
    error IdenticalCurrencies();
    error PriceOverflow();

    /// @notice Uniswap-style encode: sqrt(amount1/amount0) * 2^96.
    function encodeSqrtPriceX96(uint256 amount0, uint256 amount1) internal pure returns (uint160 sqrtPriceX96) {
        if (amount0 == 0 || amount1 == 0) revert ZeroAmount();
        // ratioX192 = amount1 * 2^192 / amount0; sqrt → Q64.96
        uint256 ratioX192 = FullMathMulDiv(amount1, 1 << 192, amount0);
        uint256 root = Math.sqrt(ratioX192);
        if (root > type(uint160).max) revert PriceOverflow();
        sqrtPriceX96 = uint160(root);
        if (sqrtPriceX96 == 0) revert PriceOverflow();
    }

    /**
     * @notice sqrtPriceX96 for an INDEX/USDC pool at a given NAV per share (WAD).
     * @param index Index share token address.
     * @param usdc USDC token address.
     * @param indexDecimals INDEX decimals (MUST be 18 for Omnibit).
     * @param usdcDecimals USDC decimals (6 on Base).
     * @param navPerShareWad USD WAD value of one full share (10^indexDecimals raw). 1e18 = $1.
     */
    function sqrtPriceX96FromNav(
        address index,
        address usdc,
        uint8 indexDecimals,
        uint8 usdcDecimals,
        uint256 navPerShareWad
    ) internal pure returns (uint160) {
        if (index == usdc) revert IdenticalCurrencies();
        if (navPerShareWad == 0) revert ZeroNav();

        uint256 oneIndex = 10 ** uint256(indexDecimals);
        uint256 usdcForOneShare = Math.mulDiv(navPerShareWad, 10 ** uint256(usdcDecimals), WAD);

        if (index < usdc) {
            return encodeSqrtPriceX96(oneIndex, usdcForOneShare);
        } else {
            return encodeSqrtPriceX96(usdcForOneShare, oneIndex);
        }
    }

    /// @notice Convenience: $1 NAV (navPerShareWad = 1e18).
    function sqrtPriceX96AtOneDollar(address index, address usdc, uint8 indexDecimals, uint8 usdcDecimals)
        internal
        pure
        returns (uint160)
    {
        return sqrtPriceX96FromNav(index, usdc, indexDecimals, usdcDecimals, WAD);
    }

    /// @notice Whether `tokenA` sorts as currency0 vs `tokenB`.
    function isCurrency0(address tokenA, address tokenB) internal pure returns (bool) {
        return tokenA < tokenB;
    }

    /// @dev Local mulDiv to avoid naming clash; identical to Math.mulDiv.
    function FullMathMulDiv(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256) {
        return Math.mulDiv(a, b, denominator);
    }
}
