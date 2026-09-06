// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IUniswapV4SwapAdapter} from "../../src/periphery/interfaces/IUniswapV4SwapAdapter.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * @title MockSwapAdapter
 * @notice Unit-test exact-in adapter: pulls tokenIn, mints/transfers tokenOut at a fixed rate.
 * @dev rateWad[tokenIn][tokenOut] = tokenOut amount per 1 unit of tokenIn, scaled by 1e18.
 *      Example: USDC(6) → tNVDA(18) at $200 ⇒ 1e6 USDC buys 1e18/200 tNVDA
 *      ⇒ out = amountIn * rateWad / 1e18 with rateWad = 1e18 * 1e18 / (200 * 1e6) = 5e27?
 *      Simpler: setOutPerIn(tokenIn, tokenOut, outWeiPerInWei) as raw mulDiv factor in WAD:
 *      amountOut = amountIn * outPerInWad / 1e18
 */
contract MockSwapAdapter is IUniswapV4SwapAdapter {
    using SafeERC20 for IERC20;

    uint256 internal constant WAD = 1e18;

    mapping(address => mapping(address => uint256)) public outPerInWad;
    /// @dev Optional: if true, mint tokenOut via MockERC20.mint; else transfer from this contract's balance.
    bool public mintOut = true;

    error DeadlineExpired();
    error ZeroRate();
    error InsufficientOut();
    error ZeroAmount();

    function setOutPerInWad(address tokenIn, address tokenOut, uint256 rateWad) external {
        outPerInWad[tokenIn][tokenOut] = rateWad;
    }

    function setMintOut(bool mintOut_) external {
        mintOut = mintOut_;
    }

    function swapExactInput(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        override
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0) revert ZeroAmount();
        uint256 rate = outPerInWad[tokenIn][tokenOut];
        if (rate == 0) revert ZeroRate();

        amountOut = (amountIn * rate) / WAD;
        if (amountOut < minOut) revert InsufficientOut();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        if (mintOut) {
            MockERC20(tokenOut).mint(msg.sender, amountOut);
        } else {
            IERC20(tokenOut).safeTransfer(msg.sender, amountOut);
        }
    }
}
