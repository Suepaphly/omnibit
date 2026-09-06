// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";

/**
 * @title ILiquidityMinter
 * @notice Full-range LP seed surface used by IndexLauncher.
 * @dev Local harness: LocalPositionManager (pull + fake NFT id).
 *      Sepolia / production: V4PositionMinter wraps live PositionManager.modifyLiquidities.
 */
interface ILiquidityMinter {
    /// @notice Mint a full-range position; returns ERC-721 token id and amounts used.
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
