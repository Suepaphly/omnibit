// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

interface IB20Factory {
    function createB20(uint8 variant, bytes32 salt, bytes calldata params, bytes[] calldata initCalls)
        external
        payable
        returns (address token);
    function getB20Address(uint8 variant, address deployer, bytes32 salt) external view returns (address);
    function isB20Initialized(address token) external view returns (bool);
}

interface IB20Asset {
    function grantRole(bytes32 role, address account) external;
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) external;
}

contract DeployTestB20s is Script {
    address constant B20_FACTORY = 0xB20f000000000000000000000000000000000000;
    uint256 internal constant BASE_SEPOLIA = 84532;
    uint8 internal constant VARIANT_ASSET = 0;
    uint8 internal constant ASSET_PARAMS_VERSION = 1;
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

        address admin = vm.envOr("B20_ADMIN", msg.sender);
        uint256 mintAmount = vm.envOr("B20_MINT_AMOUNT", uint256(1_000_000 ether));
        bytes32 saltNvda = vm.envOr("TNVDA_SALT", keccak256("omnibit.tNVDA.sepolia.v1"));
        bytes32 saltMsft = vm.envOr("TMSFT_SALT", keccak256("omnibit.tMSFT.sepolia.v1"));

        IB20Factory factory = IB20Factory(B20_FACTORY);
        address predictedNvda = factory.getB20Address(VARIANT_ASSET, admin, saltNvda);
        address predictedMsft = factory.getB20Address(VARIANT_ASSET, admin, saltMsft);

        console2.log("admin", admin);
        console2.log("predicted tNVDA", predictedNvda);
        console2.log("predicted tMSFT", predictedMsft);

        vm.startBroadcast();

        address tNVDA = _createOrGet(factory, admin, saltNvda, "Omnibit Test NVDA", "tNVDA", predictedNvda);
        address tMSFT = _createOrGet(factory, admin, saltMsft, "Omnibit Test MSFT", "tMSFT", predictedMsft);

        _mintIfNeeded(tNVDA, admin, mintAmount);
        _mintIfNeeded(tMSFT, admin, mintAmount);

        vm.stopBroadcast();

        console2.log("T_NVDA", tNVDA);
        console2.log("T_MSFT", tMSFT);
        console2.log("NEXT_PUBLIC_TNVDA", tNVDA);
        console2.log("NEXT_PUBLIC_TMSFT", tMSFT);
        console2.log("minted per token (raw 18-dec)", mintAmount);
    }

    function _createOrGet(
        IB20Factory factory,
        address admin,
        bytes32 salt,
        string memory name,
        string memory symbol,
        address predicted
    ) internal returns (address token) {
        if (factory.isB20Initialized(predicted)) {
            console2.log("already initialized", predicted);
            return predicted;
        }

        bytes memory params = abi.encode(
            B20AssetCreateParams({
                version: ASSET_PARAMS_VERSION,
                name: name,
                symbol: symbol,
                initialAdmin: admin,
                decimals: 18
            })
        );

        bytes[] memory initCalls = new bytes[](1);
        initCalls[0] = abi.encodeCall(IB20Asset.grantRole, (MINT_ROLE, admin));

        token = factory.createB20(VARIANT_ASSET, salt, params, initCalls);
        require(token == predicted, "B20 address mismatch");
        console2.log(symbol, token);
    }

    function _mintIfNeeded(address token, address admin, uint256 amount) internal {
        if (amount == 0) return;
        address[] memory recipients = new address[](1);
        recipients[0] = admin;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;
        IB20Asset(token).batchMint(recipients, amounts);
    }
}