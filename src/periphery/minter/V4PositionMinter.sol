// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {TickMath} from "@uniswap/v4-core/libraries/TickMath.sol";

import {ILiquidityMinter} from "../interfaces/ILiquidityMinter.sol";
import {LiquidityAmountsLite} from "../../libs/LiquidityAmountsLite.sol";

/**
 * @title V4PositionMinter
 * @notice Production adapter: ILiquidityMinter → Uniswap V4 PositionManager.modifyLiquidities.
 * @dev Pulls tokens from caller, sets Permit2 allowance for PositionManager, encodes:
 *      MINT_POSITION + CLOSE_CURRENCY x2 (v4-periphery finalizeModifyLiquidityWithClose pattern).
 *      IndexLauncher keeps approving this adapter (not the raw PositionManager).
 */
contract V4PositionMinter is ILiquidityMinter {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    /// @dev Matches v4-periphery Actions constants.
    uint256 private constant MINT_POSITION = 0x02;
    uint256 private constant CLOSE_CURRENCY = 0x12;

    /// @dev PoolManager `pools` mapping slot (StateLibrary.POOLS_SLOT).
    bytes32 private constant POOLS_SLOT = bytes32(uint256(6));

    IV4PositionManager public immutable positionManager;
    IPermit2Allowance public immutable permit2;
    IExtsload public immutable poolManager;

    error DeadlineExpired();
    error ZeroAddress();
    error InsufficientLiquidity();
    error Slippage();

    constructor(address positionManager_, address permit2_, address poolManager_) {
        if (positionManager_ == address(0) || permit2_ == address(0) || poolManager_ == address(0)) {
            revert ZeroAddress();
        }
        positionManager = IV4PositionManager(positionManager_);
        permit2 = IPermit2Allowance(permit2_);
        poolManager = IExtsload(poolManager_);
    }

    /// @inheritdoc ILiquidityMinter
    function mintFullRange(
        PoolKey calldata key,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address recipient,
        uint256 deadline
    ) external override returns (uint256 tokenId, uint256 amount0, uint256 amount1) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (recipient == address(0)) revert ZeroAddress();

        address token0 = Currency.unwrap(key.currency0);
        address token1 = Currency.unwrap(key.currency1);

        if (amount0Desired > 0) {
            IERC20(token0).safeTransferFrom(msg.sender, address(this), amount0Desired);
            _approvePermit2(token0, amount0Desired, deadline);
        }
        if (amount1Desired > 0) {
            IERC20(token1).safeTransferFrom(msg.sender, address(this), amount1Desired);
            _approvePermit2(token1, amount1Desired, deadline);
        }

        int24 tickLower = TickMath.minUsableTick(key.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(key.tickSpacing);
        uint160 sqrtPriceX96 = _sqrtPriceX96(key.toId());
        uint128 liquidity = LiquidityAmountsLite.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0Desired,
            amount1Desired
        );
        if (liquidity == 0) revert InsufficientLiquidity();

        uint128 amount0Max = _toUint128(amount0Desired);
        uint128 amount1Max = _toUint128(amount1Desired);

        tokenId = positionManager.nextTokenId();
        positionManager.modifyLiquidities(
            _encodeMintClose(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient), deadline
        );

        amount0 = amount0Desired - IERC20(token0).balanceOf(address(this));
        amount1 = amount1Desired - IERC20(token1).balanceOf(address(this));
        if (amount0 < amount0Min || amount1 < amount1Min) revert Slippage();

        _refund(token0, msg.sender);
        _refund(token1, msg.sender);
    }

    function _approvePermit2(address token, uint256 amount, uint256 deadline) internal {
        IERC20(token).forceApprove(address(permit2), amount);
        uint48 expiration = deadline >= type(uint48).max ? type(uint48).max : uint48(deadline);
        uint160 allowanceAmt = amount >= type(uint160).max ? type(uint160).max : uint160(amount);
        permit2.approve(token, address(positionManager), allowanceAmt, expiration);
    }

    function _encodeMintClose(
        PoolKey calldata key,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        address recipient
    ) internal pure returns (bytes memory) {
        bytes memory actions = new bytes(3);
        actions[0] = bytes1(uint8(MINT_POSITION));
        actions[1] = bytes1(uint8(CLOSE_CURRENCY));
        actions[2] = bytes1(uint8(CLOSE_CURRENCY));

        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, bytes(""));
        params[1] = abi.encode(key.currency0);
        params[2] = abi.encode(key.currency1);

        return abi.encode(actions, params);
    }

    function _sqrtPriceX96(PoolId poolId) internal view returns (uint160 sqrtPriceX96) {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        bytes32 data = poolManager.extsload(stateSlot);
        assembly ("memory-safe") {
            sqrtPriceX96 := and(data, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
        }
        if (sqrtPriceX96 == 0) revert InsufficientLiquidity();
    }

    function _toUint128(uint256 x) internal pure returns (uint128 y) {
        if (x > type(uint128).max) return type(uint128).max;
        return uint128(x);
    }

    function _refund(address token, address to) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).safeTransfer(to, bal);
    }
}

interface IV4PositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
}

interface IPermit2Allowance {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IExtsload {
    function extsload(bytes32 slot) external view returns (bytes32 value);
}
