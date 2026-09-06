// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {MockPriceFeed} from "../src/testnet/MockPriceFeed.sol";

/**
 * @title DeployMockFeeds
 * @notice Deploy Chainlink-compatible mock feeds for tNVDA ($200) and tMSFT ($500).
 * @dev Base Sepolia only (chain id 84532). Do NOT broadcast without Sepolia keys.
 *
 *      After deploy, guardian must `IndexFactory.approveAsset(tNVDA, nvdaFeed)` etc.
 *      Constituent token addresses come from live B20 Factory creates (see DeployTestB20s).
 */
contract DeployMockFeeds is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external returns (address nvdaFeed, address msftFeed) {
        // require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        // vm.startBroadcast(); // Sepolia-only - uncomment with --broadcast + key
        nvdaFeed = address(new MockPriceFeed("tNVDA/USD", 200_00000000));
        msftFeed = address(new MockPriceFeed("tMSFT/USD", 500_00000000));
        // vm.stopBroadcast();

        console2.log("MockPriceFeed tNVDA/USD", nvdaFeed);
        console2.log("MockPriceFeed tMSFT/USD", msftFeed);
        console2.log("NOTE: broadcast disabled; re-run with --broadcast on chain 84532");
    }
}
