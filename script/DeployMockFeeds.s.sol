// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockPriceFeed} from "../src/testnet/MockPriceFeed.sol";
import {IndexFactory} from "../src/core/IndexFactory.sol";

contract DeployMockFeeds is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address factory = vm.envAddress("INDEX_FACTORY");
        address tNVDA = vm.envAddress("T_NVDA");
        address tMSFT = vm.envAddress("T_MSFT");

        vm.startBroadcast();
        address nvdaFeed = address(new MockPriceFeed("tNVDA/USD", 200_00000000));
        address msftFeed = address(new MockPriceFeed("tMSFT/USD", 500_00000000));
        IndexFactory(factory).approveAsset(tNVDA, nvdaFeed);
        IndexFactory(factory).approveAsset(tMSFT, msftFeed);
        vm.stopBroadcast();

        console2.log("NVDA_FEED", nvdaFeed);
        console2.log("MSFT_FEED", msftFeed);
    }
}