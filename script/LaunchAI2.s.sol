// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolId} from "@uniswap/v4-core/types/PoolId.sol";

import {IndexFactory} from "../src/core/IndexFactory.sol";
import {IndexLauncher} from "../src/launch/IndexLauncher.sol";

contract LaunchAI2 is Script {
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address launcherAddr = vm.envAddress("INDEX_LAUNCHER");
        address tNVDA = vm.envAddress("T_NVDA");
        address tMSFT = vm.envAddress("T_MSFT");
        uint256 backingUSDC = vm.envOr("BACKING_USDC", uint256(4e6));
        uint256 lpUSDC = vm.envOr("LP_USDC", uint256(2e6));

        address[] memory cons = new address[](2);
        cons[0] = tNVDA;
        cons[1] = tMSFT;
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        IndexFactory.CreateIndexParams memory params = IndexFactory.CreateIndexParams({
            name: "Index AI2",
            symbol: "AI2",
            constituents: cons,
            initialWeightsBps: w,
            creator: msg.sender
        });

        IndexLauncher launcher = IndexLauncher(launcherAddr);
        uint256[] memory minAmountsOut = new uint256[](2);

        vm.startBroadcast();
        IERC20(USDC).approve(launcherAddr, backingUSDC + lpUSDC);
        (address index, address engine, uint256 grossShares) =
            launcher.createSeed(params, backingUSDC, backingUSDC, minAmountsOut, block.timestamp + 2 hours);

        IERC20(index).approve(launcherAddr, type(uint256).max);
        (PoolId poolId, uint256 tokenId) =
            launcher.initializeMarket(index, lpUSDC, lpUSDC, block.timestamp + 2 hours);
        vm.stopBroadcast();

        console2.log("INDEX_AI2", index);
        console2.log("ENGINE", engine);
        console2.log("grossShares", grossShares);
        console2.logBytes32(PoolId.unwrap(poolId));
        console2.log("AI2_LP_NFT", tokenId);
        console2.log("NEXT_PUBLIC_INDEX_AI2", index);
        console2.log("NEXT_PUBLIC_ENGINE", engine);
    }
}
