// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ILiquidityMinter} from "./ILiquidityMinter.sol";

/**
 * @title IPositionManagerMinimal
 * @notice Backward-compatible alias for ILiquidityMinter (S-01 adapter surface).
 * @dev Prefer ILiquidityMinter in new code. LocalPositionManager and V4PositionMinter both implement it.
 */
interface IPositionManagerMinimal is ILiquidityMinter {}
