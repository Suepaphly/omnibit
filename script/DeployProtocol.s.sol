// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {AccretiveIndex} from "../src/core/AccretiveIndex.sol";
import {IndexFactory} from "../src/core/IndexFactory.sol";
import {AccretionEngine} from "../src/accretion/AccretionEngine.sol";
import {IndexZapRouter} from "../src/periphery/IndexZapRouter.sol";
import {UniswapV4SwapAdapter} from "../src/periphery/UniswapV4SwapAdapter.sol";
import {IndexFeeHook} from "../src/fees/IndexFeeHook.sol";
import {IndexLauncher} from "../src/launch/IndexLauncher.sol";
import {HookMiner} from "../src/libs/HookMiner.sol";
import {IPoolManagerMinimal} from "../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {ILiquidityMinter} from "../src/periphery/interfaces/ILiquidityMinter.sol";
import {V4PositionMinter} from "../src/periphery/minter/V4PositionMinter.sol";

contract DeployProtocol is Script {
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    uint256 internal constant BASE_SEPOLIA = 84532;

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address admin = msg.sender;
        address treasury = vm.envOr("PROTOCOL_TREASURY", admin);

        vm.startBroadcast();

        address indexImpl = address(new AccretiveIndex());
        address engineImpl = address(new AccretionEngine());
        address factory = address(new IndexFactory(indexImpl, engineImpl, USDC, admin, treasury, address(0), admin));
        address adapter = address(
            new UniswapV4SwapAdapter(IPoolManagerMinimal(POOL_MANAGER), IndexFactory(factory), USDC, admin)
        );
        IndexFactory(factory).setSwapAdapter(adapter);
        address zap = address(new IndexZapRouter(IndexFactory(factory), USDC, adapter, admin));
        UniswapV4SwapAdapter(adapter).setRouter(zap);

        bytes memory ctorArgs = abi.encode(POOL_MANAGER);
        (address hook, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER, HookMiner.indexFeeHookFlags(), type(IndexFeeHook).creationCode, ctorArgs
        );
        address deployed = address(new IndexFeeHook{salt: salt}(IPoolManagerMinimal(POOL_MANAGER)));
        require(deployed == hook, "hook mismatch");

        address minter = address(new V4PositionMinter(POSITION_MANAGER, PERMIT2, POOL_MANAGER));
        address launcher = address(
            new IndexLauncher(
                IndexFactory(factory),
                USDC,
                IndexZapRouter(zap),
                IndexFeeHook(hook),
                IPoolManagerMinimal(POOL_MANAGER),
                ILiquidityMinter(minter),
                admin
            )
        );
        IndexFactory(factory).setLauncher(launcher);
        IndexFeeHook(hook).setLauncher(launcher);
        IndexFeeHook(hook).setFactory(factory);
        IndexFeeHook(hook).setUsdc(USDC);
        IndexFeeHook(hook).setProtocolTreasury(treasury);

        vm.stopBroadcast();

        console2.log("INDEX_FACTORY", factory);
        console2.log("SWAP_ADAPTER", adapter);
        console2.log("ZAP_ROUTER", zap);
        console2.log("FEE_HOOK", hook);
        console2.logBytes32(salt);
        console2.log("POSITION_MINTER", minter);
        console2.log("INDEX_LAUNCHER", launcher);
    }
}
