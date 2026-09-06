// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/types/BeforeSwapDelta.sol";

import {IPoolManagerMinimal} from "../../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {IUnlockCallback} from "../../src/periphery/interfaces/IUnlockCallback.sol";

/**
 * @title LocalPoolManager
 * @notice Lightweight PoolManager harness for unit tests (not a real AMM).
 * @dev Tokens for `take` must be pre-funded on this contract. `swap` returns deltas only.
 */
contract LocalPoolManager is IPoolManagerMinimal {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;

    mapping(PoolId => bool) public initialized;
    mapping(PoolId => uint160) public sqrtPriceX96Of;
    mapping(address => mapping(address => uint256)) public outPerInWad;

    uint256 internal constant WAD = 1e18;

    address public unlocker;
    bool public locked = true;

    error AlreadyUnlocked();
    error ManagerLocked();
    error PoolAlreadyInitialized();
    error PoolNotInitialized();
    error ZeroRate();

    function setOutPerInWad(address tokenIn, address tokenOut, uint256 rateWad) external {
        outPerInWad[tokenIn][tokenOut] = rateWad;
    }

    function unlock(bytes calldata data) external override returns (bytes memory result) {
        if (!locked) revert AlreadyUnlocked();
        locked = false;
        unlocker = msg.sender;
        result = IUnlockCallback(msg.sender).unlockCallback(data);
        unlocker = address(0);
        locked = true;
    }

    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external override returns (int24 tick) {
        PoolId id = key.toId();
        if (initialized[id]) revert PoolAlreadyInitialized();
        if (address(key.hooks) != address(0)) {
            key.hooks.beforeInitialize(msg.sender, key, sqrtPriceX96);
        }
        initialized[id] = true;
        sqrtPriceX96Of[id] = sqrtPriceX96;
        tick = 0;
    }

    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        override
        returns (BalanceDelta swapDelta)
    {
        if (locked) revert ManagerLocked();
        PoolId id = key.toId();
        if (!initialized[id]) revert PoolNotInitialized();

        BeforeSwapDelta bsd;
        if (address(key.hooks) != address(0)) {
            (, bsd,) = key.hooks.beforeSwap(msg.sender, key, params, hookData);
        }

        address tokenIn = params.zeroForOne ? Currency.unwrap(key.currency0) : Currency.unwrap(key.currency1);
        address tokenOut = params.zeroForOne ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);

        require(params.amountSpecified < 0, "exact-out");
        uint256 amountIn = uint256(-params.amountSpecified);
        int128 specTake = bsd.getSpecifiedDelta();
        if (specTake > 0) {
            amountIn -= uint256(uint128(specTake));
        }

        uint256 rate = outPerInWad[tokenIn][tokenOut];
        if (rate == 0) revert ZeroRate();
        uint256 amountOut = (amountIn * rate) / WAD;

        int128 d0;
        int128 d1;
        if (params.zeroForOne) {
            d0 = -int128(int256(uint256(-params.amountSpecified)));
            d1 = int128(uint128(amountOut));
        } else {
            d1 = -int128(int256(uint256(-params.amountSpecified)));
            d0 = int128(uint128(amountOut));
        }
        swapDelta = toBalanceDelta(d0, d1);

        if (address(key.hooks) != address(0)) {
            (, int128 unsTake) = key.hooks.afterSwap(msg.sender, key, params, swapDelta, hookData);
            if (unsTake > 0) {
                amountOut -= uint256(uint128(unsTake));
                if (params.zeroForOne) {
                    swapDelta = toBalanceDelta(d0, int128(uint128(amountOut)));
                } else {
                    swapDelta = toBalanceDelta(int128(uint128(amountOut)), d1);
                }
            }
        }
    }

    function sync(Currency) external override {}

    function take(Currency currency, address to, uint256 amount) external override {
        IERC20(Currency.unwrap(currency)).safeTransfer(to, amount);
    }

    function settle() external payable override returns (uint256) {
        return 0;
    }

    function settleFor(address) external payable override returns (uint256) {
        return 0;
    }
}
