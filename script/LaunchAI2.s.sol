// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IndexFactory} from "../src/core/IndexFactory.sol";
import {IndexLauncher} from "../src/launch/IndexLauncher.sol";

/**
 * @title LaunchAI2
 * @notice Two-tx Index AI2 launch: createSeed + initializeMarket placeholders.
 * @dev Fill env / constants after DeployProtocol + DeployTestB20s + SeedConstituentPools.
 *
 *      Env (recommended):
 *        INDEX_LAUNCHER   - deployed IndexLauncher
 *        T_NVDA           - B20 tNVDA address
 *        T_MSFT           - B20 tMSFT address
 *        CREATOR          - launch creator (defaults to msg.sender)
 *        BACKING_USDC     - 6-dec USDC for seed (default 1000e6)
 *        LP_USDC          - 6-dec USDC for LP seed (default 50e6)
 *
 *      Broadcast is Sepolia-only (84532).
 */
contract LaunchAI2 is Script {
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external {
        // require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address launcherAddr = vm.envAddress("INDEX_LAUNCHER");
        address tNVDA = vm.envAddress("T_NVDA");
        address tMSFT = vm.envAddress("T_MSFT");
        address creator = vm.envOr("CREATOR", msg.sender);
        uint256 backingUSDC = vm.envOr("BACKING_USDC", uint256(1000e6));
        uint256 lpUSDC = vm.envOr("LP_USDC", uint256(50e6));

        IndexLauncher launcher = IndexLauncher(launcherAddr);

        address[] memory cons = new address[](2);
        cons[0] = tNVDA;
        cons[1] = tMSFT;
        uint16[] memory w = new uint16[](2);
        w[0] = 5000;
        w[1] = 5000;

        IndexFactory.CreateIndexParams memory params = IndexFactory.CreateIndexParams({
            name: "Index AI2", symbol: "AI2", constituents: cons, initialWeightsBps: w, creator: creator
        });

        console2.log("Tx1 createSeed - approve USDC to launcher first");
        console2.log("launcher", launcherAddr);
        console2.log("tNVDA", tNVDA);
        console2.log("tMSFT", tMSFT);
        console2.log("backingUSDC", backingUSDC);

        // --- Tx1 (uncomment for Sepolia broadcast) ---
        // Requires IndexLauncher wired to V4PositionMinter (see DeployProtocol).
        // Pass per-leg minAmountsOut (zeros OK for controlled Sepolia demos; tighten later).
        // vm.startBroadcast(creator);
        // IERC20(USDC).approve(address(launcher), backingUSDC);
        // uint256[] memory minAmountsOut = new uint256[](2); // or set non-zero mins
        // (address index, address engine, uint256 grossShares) =
        //     launcher.createSeed(params, backingUSDC, backingUSDC, minAmountsOut, block.timestamp + 1 hours);
        // vm.stopBroadcast();
        // console2.log("index", index);
        // console2.log("engine", engine);
        // console2.log("grossShares", grossShares);

        console2.log("Tx2 initializeMarket - after createSeed, set INDEX_AI2 env");
        // LP mint goes through V4PositionMinter -> PositionManager.modifyLiquidities (S-01).
        // address index = vm.envAddress("INDEX_AI2");
        // vm.startBroadcast(creator);
        // IERC20(USDC).approve(address(launcher), lpUSDC);
        // IERC20(index).approve(address(launcher), lpUSDC * 1e12); // rough; use exact INDEX amount
        // (bytes32 poolId, uint256 tokenId) =
        //     launcher.initializeMarket(index, lpUSDC, lpUSDC, block.timestamp + 1 hours);
        // vm.stopBroadcast();

        console2.log("NOTE: placeholders only - set env + --broadcast on 84532 to execute");
        console2.log("NOTE: createSeed now requires minAmountsOut[] (length == constituents)");
        console2.log("lpUSDC placeholder", lpUSDC);
        // silence unused
        launcher;
        params;
        creator;
    }
}
