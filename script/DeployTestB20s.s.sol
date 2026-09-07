// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IB20Factory {
    function createB20(uint8 variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls)
        external
        payable
        returns (address token);
}

interface IB20Asset {
    function grantRole(bytes32 role, address account) external;
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external;
}

contract DeployTestB20s is Script {
    address constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint8 internal constant VARIANT_ASSET = 0;
    bytes32 internal constant MINT_ROLE = keccak256("MINT_ROLE");

    struct B20AssetCreateParams {
        uint8 version;
        string name;
        string symbol;
        address initialAdmin;
        uint8 decimals;
    }

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address admin = msg.sender;
        uint256 mintAmount = 1_000_000 ether;
        bytes32 saltNvda = keccak256("omnibit.tNVDA.sepolia.v1");
        bytes32 saltMsft = keccak256("omnibit.tMSFT.sepolia.v1");

        vm.startBroadcast();
        address tNVDA = _create(admin, saltNvda, "Omnibit Test NVDA", "tNVDA");
        address tMSFT = _create(admin, saltMsft, "Omnibit Test MSFT", "tMSFT");
        _mint(tNVDA, admin, mintAmount);
        _mint(tMSFT, admin, mintAmount);
        vm.stopBroadcast();

        console2.log("T_NVDA", tNVDA);
        console2.log("T_MSFT", tMSFT);
    }

    function _create(address admin, bytes32 salt, string memory name, string memory symbol)
        internal
        returns (address token)
    {
        bytes memory params = abi.encode(
            B20AssetCreateParams({version: 1, name: name, symbol: symbol, initialAdmin: admin, decimals: 18})
        );
        bytes[] memory initCalls = new bytes[](1);
        initCalls[0] = abi.encodeCall(IB20Asset.grantRole, (MINT_ROLE, admin));
        token = IB20Factory(B20_FACTORY).createB20(VARIANT_ASSET, salt, params, initCalls);
        console2.log(symbol, token);
    }

    function _mint(address token, address admin, uint256 amount) internal {
        address[] memory recipients = new address[](1);
        recipients[0] = admin;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        IB20Asset(token).batchMint(recipients, amounts);
    }
}