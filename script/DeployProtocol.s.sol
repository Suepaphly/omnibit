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
import {IPositionManagerMinimal} from "../src/periphery/interfaces/IPositionManagerMinimal.sol";

/**
 * @title DeployProtocol
 * @notice Deploy Omnibit impls, factory, adapter, zap, mined hook, launcher; wire roles.
 * @dev Base Sepolia (84532). Broadcast Sepolia-only.
 *
 *      Addresses (spec §4.1) - re-check before broadcast:
 *        USDC             0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *        PoolManager      0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408
 *        PositionManager  0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80
 *        CREATE2 deployer 0x4e59b44847b379578588920cA78FbF26c0B4956C
 */
contract DeployProtocol is Script {
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        address admin = msg.sender;
        address treasury = vm.envOr("PROTOCOL_TREASURY", admin);

        // vm.startBroadcast(); // Sepolia-only

        address indexImpl = address(new AccretiveIndex());
        address engineImpl = address(new AccretionEngine());
        address factory = _deployFactory(indexImpl, engineImpl, admin, treasury);
        address adapter = _deployAdapter(factory, admin);
        IndexFactory(factory).setSwapAdapter(adapter);
        address zap = address(new IndexZapRouter(IndexFactory(factory), USDC, adapter, admin));
        UniswapV4SwapAdapter(adapter).setRouter(zap);

        (address hook, bytes32 salt) = _mineAndDeployHook();
        address launcher = _deployLauncher(factory, zap, hook, admin);
        _wire(factory, hook, launcher, treasury);

        // vm.stopBroadcast();

        console2.log("indexImpl", indexImpl);
        console2.log("engineImpl", engineImpl);
        console2.log("factory", factory);
        console2.log("adapter", adapter);
        console2.log("zap", zap);
        console2.log("hook", hook);
        console2.log("launcher", launcher);
        console2.logBytes32(salt);
        console2.log("CREATE2_DEPLOYER (use on Sepolia broadcast)", CREATE2_DEPLOYER);
        console2.log("NOTE: broadcast disabled; approveAsset + PoolKeys still required");
    }

    function _deployFactory(address indexImpl, address engineImpl, address admin, address treasury)
        internal
        returns (address)
    {
        return address(new IndexFactory(indexImpl, engineImpl, USDC, admin, treasury, address(0), admin));
    }

    function _deployAdapter(address factory, address admin) internal returns (address) {
        return address(new UniswapV4SwapAdapter(IPoolManagerMinimal(POOL_MANAGER), IndexFactory(factory), USDC, admin));
    }

    function _mineAndDeployHook() internal returns (address hook, bytes32 salt) {
        // Dry-run: mine with this script as deployer. On Sepolia, mine with CREATE2_DEPLOYER.
        bytes memory ctorArgs = abi.encode(POOL_MANAGER);
        address predicted;
        (predicted, salt) =
            HookMiner.find(address(this), HookMiner.indexFeeHookFlags(), type(IndexFeeHook).creationCode, ctorArgs);
        hook = address(new IndexFeeHook{salt: salt}(IPoolManagerMinimal(POOL_MANAGER)));
        require(hook == predicted, "hook mismatch");
    }

    function _deployLauncher(address factory, address zap, address hook, address admin) internal returns (address) {
        return address(
            new IndexLauncher(
                IndexFactory(factory),
                USDC,
                IndexZapRouter(zap),
                IndexFeeHook(hook),
                IPoolManagerMinimal(POOL_MANAGER),
                IPositionManagerMinimal(POSITION_MANAGER),
                admin
            )
        );
    }

    function _wire(address factory, address hook, address launcher, address treasury) internal {
        IndexFactory(factory).setLauncher(launcher);
        IndexFeeHook h = IndexFeeHook(hook);
        h.setLauncher(launcher);
        h.setFactory(factory);
        h.setUsdc(USDC);
        h.setProtocolTreasury(treasury);
    }
}
