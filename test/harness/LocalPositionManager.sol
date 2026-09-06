// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";

import {IPositionManagerMinimal} from "../../src/periphery/interfaces/IPositionManagerMinimal.sol";

/**
 * @title LocalPositionManager
 * @notice Mock PositionManager: pulls desired amounts, mints incremental token ids to recipient.
 */
contract LocalPositionManager is IPositionManagerMinimal {
    using SafeERC20 for IERC20;

    uint256 public nextId = 1;
    mapping(uint256 => address) public ownerOf;

    error DeadlineExpired();

    function mintFullRange(
        PoolKey calldata key,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256,
        uint256,
        address recipient,
        uint256 deadline
    ) external override returns (uint256 tokenId, uint256 amount0, uint256 amount1) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        amount0 = amount0Desired;
        amount1 = amount1Desired;
        if (amount0 > 0) {
            IERC20(Currency.unwrap(key.currency0)).safeTransferFrom(msg.sender, address(this), amount0);
        }
        if (amount1 > 0) {
            IERC20(Currency.unwrap(key.currency1)).safeTransferFrom(msg.sender, address(this), amount1);
        }
        tokenId = nextId++;
        ownerOf[tokenId] = recipient;
    }
}
