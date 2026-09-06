// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

/**
 * @title DeployTestB20s
 * @notice Stub: create tNVDA / tMSFT via live Base B20 Factory on Base Sepolia.
 * @dev Normal Foundry anvil does NOT host B20 precompiles. This script is not runnable locally.
 *
 *      Live dependency (spec §4.1):
 *        B20 Factory = 0xB20f000000000000000000000000000000000000
 *
 *      Steps on Sepolia / base-anvil:
 *        1. Call B20 Factory createB20(ASSET, ...) with published salts for tNVDA and tMSFT
 *           (labels test-only; decimals 18; no transfer policies; unpaused).
 *        2. Record addresses; set env T_NVDA / T_MSFT for LaunchAI2 + approveAsset.
 *        3. Do NOT deploy homemade ERC-20s named tNVDA/tMSFT.
 *
 *      See: https://github.com/base/base-std/blob/main/docs/B20/Factory.md
 */
contract DeployTestB20s is Script {
    address constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external view {
        console2.log("DeployTestB20s STUB - requires live B20 Factory on chain", BASE_SEPOLIA);
        console2.log("B20 Factory", B20_FACTORY);
        console2.log("Action: createB20 ASSET variant for tNVDA and tMSFT with fixed salts");
        console2.log("Not executable on plain anvil (no B20 precompiles)");
    }
}
