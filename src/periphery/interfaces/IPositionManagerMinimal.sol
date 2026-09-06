// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";

/**
 * @title IPositionManagerMinimal
 * @notice Minimal PositionManager surface for IndexLauncher full-range LP seed.
 * @dev Production uses Uniswap V4 PositionManager; unit tests use a LocalPositionManager mock.
 */
interface IPositionManagerMinimal {
    /// @notice Mint a full-range (or caller-specified) position; returns ERC-721 token id.
    function mintFullRange(
        PoolKey calldata key,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address recipient,
        uint256 deadline
    ) external returns (uint256 tokenId, uint256 amount0, uint256 amount1);
}
