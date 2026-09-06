// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PoolId} from "@uniswap/v4-core/types/PoolId.sol";

import {AccretiveIndex} from "../src/core/AccretiveIndex.sol";
import {AccretionEngine} from "../src/accretion/AccretionEngine.sol";
import {IndexFeeHook} from "../src/fees/IndexFeeHook.sol";
import {IndexFactory} from "../src/core/IndexFactory.sol";

/**
 * @title DemoAccretion
 * @notice Narrative script: sweepFees -> harvest -> redeem (post-accretion more basket).
 * @dev Assumes Index AI2 already launched and canonical pool has accrued hook USDC.
 *
 *      Env:
 *        INDEX_FEE_HOOK
 *        INDEX_AI2
 *        POOL_ID          - bytes32 PoolId of AI2/USDC
 *        REDEEMER         - address holding AI2 shares (defaults msg.sender)
 *        REDEEM_SHARES    - 18-dec shares to redeem after harvest (default 10e18)
 *
 *      Broadcast Sepolia-only. Local integration coverage: test/integration/OmnibitLoop.t.sol.
 */
contract DemoAccretion is Script {
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external {
        // require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address hookAddr = vm.envAddress("INDEX_FEE_HOOK");
        address indexAddr = vm.envAddress("INDEX_AI2");
        bytes32 poolIdRaw = vm.envBytes32("POOL_ID");
        address redeemer = vm.envOr("REDEEMER", msg.sender);
        uint256 redeemShares = vm.envOr("REDEEM_SHARES", uint256(10e18));

        IndexFeeHook hook = IndexFeeHook(hookAddr);
        AccretiveIndex index = AccretiveIndex(indexAddr);
        address engineAddr = IndexFactory(index.factory()).engineOf(indexAddr);
        AccretionEngine engine = AccretionEngine(engineAddr);
        PoolId poolId = PoolId.wrap(poolIdRaw);

        console2.log("--- DemoAccretion narrative ---");
        console2.log("1) previewRedeem baseline (pre-harvest)");
        // (uint256[] memory outBefore,,) = index.previewRedeem(redeemShares);

        console2.log("2) sweepFees(poolId) -> 50% treasury / remainder engine");
        // vm.startBroadcast();
        // hook.sweepFees(poolId);
        // vm.stopBroadcast();

        console2.log("3) harvest(minOut, deadline) -> depositAccretion (0 shares, UsdWad up)");
        // uint256 n = index.constituentCount();
        // uint256[] memory minOut = new uint256[](n);
        // vm.startBroadcast();
        // engine.harvest(minOut, block.timestamp + 1 hours);
        // vm.stopBroadcast();

        console2.log("4) redeem same shares - expect more basket than baseline");
        // vm.startBroadcast(redeemer);
        // index.redeem(redeemShares, redeemer);
        // vm.stopBroadcast();

        console2.log("index", indexAddr);
        console2.log("engine", engineAddr);
        console2.log("pendingHookUsdc", hook.pendingHookUsdc(poolId));
        console2.log("cumulativeAccretedUsdWad", index.cumulativeAccretedUsdWad());
        console2.log("totalSupply", index.totalSupply());
        console2.log("NOTE: uncomment broadcast steps on Sepolia after launch + swaps");

        // silence
        redeemer;
        redeemShares;
        engine;
    }
}
