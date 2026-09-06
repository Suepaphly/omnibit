// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {PoolId} from "@uniswap/v4-core/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";

/**
 * @title IPoolManagerMinimal
 * @notice Subset of Uniswap V4 PoolManager used by Omnibit adapter / launcher / hook.
 * @dev Production deploys against the real PoolManager; unit tests use LocalPoolManager.
 */
interface IPoolManagerMinimal {
    function unlock(bytes calldata data) external returns (bytes memory);
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (BalanceDelta swapDelta);
    function sync(Currency currency) external;
    function take(Currency currency, address to, uint256 amount) external;
    function settle() external payable returns (uint256 paid);
    function settleFor(address recipient) external payable returns (uint256 paid);
}
