// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IUniswapV4SwapAdapter
 * @notice Minimal exact-in swap surface used by AccretionEngine (and later Zap/Launcher).
 * @dev Full UniswapV4SwapAdapter (PoolKey allowlist, unlock callback) is not in this phase.
 *      Unit tests use a mock that transfers/mints tokens without a live V4 pool.
 */
interface IUniswapV4SwapAdapter {
    /// @notice Exact-input swap. Pulls `amountIn` of `tokenIn` from caller; sends `amountOut` of `tokenOut` to caller.
    /// @param tokenIn Input token (typically USDC for harvest).
    /// @param tokenOut Output token (constituent).
    /// @param amountIn Exact input amount in `tokenIn` native decimals.
    /// @param minOut Minimum acceptable `tokenOut` (slippage).
    /// @param deadline Unix timestamp; MUST revert if `block.timestamp > deadline`.
    /// @return amountOut Amount of `tokenOut` delivered to the caller.
    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 amountOut);
}
