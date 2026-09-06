// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/libraries/Hooks.sol";

/**
 * @title HookMiner
 * @notice CREATE2 salt miner so IndexFeeHook permission bits land in the deployed address.
 * @dev Adapted from Uniswap v4-periphery test/shared/HookMiner.sol (MIT).
 */
library HookMiner {
    uint160 internal constant FLAG_MASK = Hooks.ALL_HOOK_MASK;
    uint256 internal constant MAX_LOOP = 160_444;

    /// @notice Find a salt that produces a hook address with the desired `flags`.
    /// @param deployer In forge test: `address(this)` (or the pranking deployer).
    ///                 In forge script: CREATE2 Deployer Proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`.
    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        view
        returns (address hookAddress, bytes32 salt)
    {
        flags = flags & FLAG_MASK;
        bytes memory creationCodeWithArgs = abi.encodePacked(creationCode, constructorArgs);

        for (uint256 i; i < MAX_LOOP; ++i) {
            salt = bytes32(i);
            hookAddress = computeAddress(deployer, salt, creationCodeWithArgs);
            if (uint160(hookAddress) & FLAG_MASK == flags && hookAddress.code.length == 0) {
                return (hookAddress, salt);
            }
        }
        revert("HookMiner: could not find salt");
    }

    function computeAddress(address deployer, bytes32 salt, bytes memory creationCodeWithArgs)
        internal
        pure
        returns (address)
    {
        return address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xFF), deployer, salt, keccak256(creationCodeWithArgs)))))
        );
    }

    /// @notice Permission flags required by IndexFeeHook.
    function indexFeeHookFlags() internal pure returns (uint160) {
        return uint160(
            Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
                | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
        );
    }
}
