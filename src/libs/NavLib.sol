// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title NavLib
 * @notice WAD (1e18) NAV helpers from tracked raw amounts + Chainlink-style feed answers.
 * @dev Feed answers are typically 8 decimals (MockPriceFeed.decimals() = 8).
 *      Redeem rights MUST NOT depend on these helpers — display / zap / harvest gating only.
 *
 *      usdValueWad(amount, amountDecimals, answer, feedDecimals) =
 *        amount * answer * 1e18 / (10^amountDecimals * 10^feedDecimals)
 *
 *      For B20 display, callers MAY pass economicAmount = tracked * multiplier() / 1e18;
 *      this library treats `amount` as already-economic (identity for plain ERC-20 mocks).
 */
library NavLib {
    using Math for uint256;

    uint256 internal constant WAD = 1e18;

    error NonPositiveFeed();
    error LengthMismatch();
    error ZeroSupply();

    /// @notice USD value of `amount` in WAD given a positive feed answer.
    function usdValueWad(uint256 amount, uint8 amountDecimals, int256 feedAnswer, uint8 feedDecimals)
        internal
        pure
        returns (uint256)
    {
        if (feedAnswer <= 0) revert NonPositiveFeed();
        // (amount * answer * WAD) / (10^amountDec * 10^feedDec)
        // Two-step mulDiv avoids intermediate overflow.
        uint256 usdNative = Math.mulDiv(amount, uint256(feedAnswer), 10 ** uint256(feedDecimals));
        return Math.mulDiv(usdNative, WAD, 10 ** uint256(amountDecimals));
    }

    /// @notice Sum of per-leg USD WAD values. Arrays MUST be equal length.
    function navWad(uint256[] memory amounts, uint8 amountDecimals, int256[] memory feedAnswers, uint8 feedDecimals)
        internal
        pure
        returns (uint256 total)
    {
        uint256 n = amounts.length;
        if (feedAnswers.length != n) revert LengthMismatch();
        for (uint256 i = 0; i < n; ++i) {
            total += usdValueWad(amounts[i], amountDecimals, feedAnswers[i], feedDecimals);
        }
    }

    /// @notice navPerShareWAD = NAV_WAD * 1e18 / totalSupply. Reverts if supply == 0.
    function navPerShareWad(uint256 navWad_, uint256 totalSupply) internal pure returns (uint256) {
        if (totalSupply == 0) revert ZeroSupply();
        return Math.mulDiv(navWad_, WAD, totalSupply);
    }
}
