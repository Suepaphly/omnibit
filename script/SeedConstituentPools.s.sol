// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/**
 * @title SeedConstituentPools
 * @notice Stub: seed reusable tNVDA/USDC and tMSFT/USDC Uniswap V4 markets on Base Sepolia.
 * @dev Pre-launch liquidity so Zap / AccretionEngine adapter swaps can fill.
 *      Not fully runnable locally without live PoolManager + PositionManager + Permit2.
 *
 *      Live dependencies (spec §4.1):
 *        PoolManager      0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408
 *        PositionManager  0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80
 *        USDC             0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *        Permit2          0x000000000022D473030F116dDEE9F6B43aC78BA3
 *
 *      After pools exist:
 *        - Record PoolKeys
 *        - UniswapV4SwapAdapter.registerPool for each constituent/USDC pair
 *        - Then LaunchAI2 / DemoAccretion
 */
contract SeedConstituentPools is Script {
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external view {
        console2.log("SeedConstituentPools STUB - Base Sepolia V4 liquidity seed");
        console2.log("PoolManager", POOL_MANAGER);
        console2.log("PositionManager", POSITION_MANAGER);
        console2.log("USDC", USDC);
        console2.log("Permit2", PERMIT2);
        console2.log("Action: initialize + full-range mint tNVDA/USDC and tMSFT/USDC");
        console2.log("Then adapter.registerPool; see Uniswap V4 docs for PositionManager encoding");
        console2.log("chainId expected", BASE_SEPOLIA);
    }
}
