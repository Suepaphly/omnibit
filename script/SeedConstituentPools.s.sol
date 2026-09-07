// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {Currency} from "@uniswap/v4-core/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/interfaces/IHooks.sol";

import {IPoolManagerMinimal} from "../src/periphery/interfaces/IPoolManagerMinimal.sol";
import {V4PositionMinter} from "../src/periphery/minter/V4PositionMinter.sol";
import {UniswapV4SwapAdapter} from "../src/periphery/UniswapV4SwapAdapter.sol";
import {SqrtPriceLib} from "../src/libs/SqrtPriceLib.sol";

contract SeedConstituentPools is Script {
    using PoolIdLibrary for PoolKey;

    address constant POOL_MANAGER = 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408;
    address constant POSITION_MANAGER = 0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80;
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint256 internal constant BASE_SEPOLIA = 84532;

    uint24 internal constant FEE = 3000;
    int24 internal constant TICK_SPACING = 60;

    function run() external {
        require(block.chainid == BASE_SEPOLIA, "Base Sepolia only");

        address tNVDA = vm.envAddress("T_NVDA");
        address tMSFT = vm.envAddress("T_MSFT");
        address adapter = vm.envOr("SWAP_ADAPTER", address(0));
        address existingMinter = vm.envOr("POSITION_MINTER", address(0));

        uint256 nvdaUsd8 = vm.envOr("NVDA_USD_8DEC", uint256(200_00000000));
        uint256 msftUsd8 = vm.envOr("MSFT_USD_8DEC", uint256(500_00000000));
        uint256 usdcNvda = vm.envOr("POOL_USDC_NVDA", uint256(2e6));
        uint256 usdcMsft = vm.envOr("POOL_USDC_MSFT", uint256(2e6));

        vm.startBroadcast();

        address minter = existingMinter == address(0)
            ? address(new V4PositionMinter(POSITION_MANAGER, PERMIT2, POOL_MANAGER))
            : existingMinter;

        (PoolId idNvda, uint256 nftNvda) =
            _seedPair(tNVDA, usdcNvda, _usd8ToWad(nvdaUsd8), V4PositionMinter(minter), adapter);
        (PoolId idMsft, uint256 nftMsft) =
            _seedPair(tMSFT, usdcMsft, _usd8ToWad(msftUsd8), V4PositionMinter(minter), adapter);

        vm.stopBroadcast();

        console2.log("POSITION_MINTER", minter);
        console2.log("tNVDA/USDC poolId");
        console2.logBytes32(PoolId.unwrap(idNvda));
        console2.log("tNVDA position nft", nftNvda);
        console2.log("tMSFT/USDC poolId");
        console2.logBytes32(PoolId.unwrap(idMsft));
        console2.log("tMSFT position nft", nftMsft);
    }

    function _usd8ToWad(uint256 usd8) internal pure returns (uint256) {
        return usd8 * 1e10;
    }

    function _seedPair(
        address asset,
        uint256 usdcAmount,
        uint256 priceWad,
        V4PositionMinter minter,
        address adapter
    ) internal returns (PoolId id, uint256 tokenId) {
        require(asset != USDC, "asset=USDC");
        require(usdcAmount > 0, "zero USDC");

        uint256 assetAmount = Math.mulDiv(usdcAmount, 1e24, priceWad);
        require(assetAmount > 0, "zero asset");

        PoolKey memory key = _key(asset);
        id = key.toId();

        uint160 sqrtPrice = SqrtPriceLib.sqrtPriceX96FromNav(asset, USDC, 18, 6, priceWad);
        try IPoolManagerMinimal(POOL_MANAGER).initialize(key, sqrtPrice) {
            console2.log("initialized pool for", asset);
        } catch {
            console2.log("pool already initialized", asset);
        }

        IERC20(asset).approve(address(minter), assetAmount);
        IERC20(USDC).approve(address(minter), usdcAmount);

        (uint256 amount0, uint256 amount1) =
            asset < USDC ? (assetAmount, usdcAmount) : (usdcAmount, assetAmount);

        uint256 deadline = block.timestamp + 2 hours;
        (tokenId,,) = minter.mintFullRange(key, amount0, amount1, 0, 0, msg.sender, deadline);

        if (adapter != address(0)) {
            UniswapV4SwapAdapter(adapter).registerPoolKey(key);
        }
    }

    function _key(address asset) internal pure returns (PoolKey memory key) {
        if (asset < USDC) {
            key.currency0 = Currency.wrap(asset);
            key.currency1 = Currency.wrap(USDC);
        } else {
            key.currency0 = Currency.wrap(USDC);
            key.currency1 = Currency.wrap(asset);
        }
        key.fee = FEE;
        key.tickSpacing = TICK_SPACING;
        key.hooks = IHooks(address(0));
    }
}