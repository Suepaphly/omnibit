// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IUniswapV4SwapAdapter
 * @notice Minimal exact-in swap surface used by AccretionEngine, IndexZapRouter, and IndexLauncher.
 * @dev Production implementation: `UniswapV4SwapAdapter` (allowlisted callers/pools, one unlock callback).
 *      Unit tests may use `MockSwapAdapter` (no live V4 pool) or the production adapter + LocalPoolManager.
 */
interface IUniswapV4SwapAdapter {
    /// @notice Exact-input swap. Pulls `amountIn` of `tokenIn` from caller; sends `amountOut` of `tokenOut` to caller.
    /// @param tokenIn Input token (typically USDC for harvest/seed).
    /// @param tokenOut Output token (constituent).
    /// @param amountIn Exact input amount in `tokenIn` native decimals.
    /// @param minOut Minimum acceptable `tokenOut` (slippage).
    /// @param deadline Unix timestamp; MUST revert if `block.timestamp > deadline`.
    /// @return amountOut Amount of `tokenOut` delivered to the caller.
    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 amountOut);
}
