# Architecture — Omnibit Index Forge

## Implemented components

| Component | Path | Role |
|-----------|------|------|
| **AccretiveIndex** | `src/core/AccretiveIndex.sol` | Share token + custody + tracked ledger |
| **IndexFactory** | `src/core/IndexFactory.sol` | Asset registry; clones index + engine; `onlyLauncher` create |
| **AccretionEngine** | `src/accretion/AccretionEngine.sol` | USDC hold; harvest at launch weights; worst-leg depositAccretion |
| **IndexLauncher** | `src/launch/IndexLauncher.sol` | Two-tx createSeed + initializeMarket |
| **IndexZapRouter** | `src/periphery/IndexZapRouter.sol` | buyTargetBasket; mintExactSharesWithUSDC; redeemToUSDC (secondary) |
| **UniswapV4SwapAdapter** | `src/periphery/UniswapV4SwapAdapter.sol` | Allowlisted exact-in; one unlock callback |
| **IndexFeeHook** | `src/fees/IndexFeeHook.sol` | Global hook; 5 bps USDC fee; registry; 50/50 sweep |
| **NavLib / SqrtPriceLib / HookMiner** | `src/libs/` | WAD NAV; sqrtPriceX96; CREATE2 salt mine |
| **MockPriceFeed** | `src/testnet/MockPriceFeed.sol` | AggregatorV3 mock |
| **LocalPoolManager / LocalPositionManager** | `test/harness/` | Unit-test doubles for V4 surfaces |
| **V4PositionMinter** | `src/periphery/minter/V4PositionMinter.sol` | Sepolia ILiquidityMinter → PositionManager.modifyLiquidities |

## System diagram

```
Creator
  └─ IndexLauncher.createSeed
       ├─ IndexFactory.createIndex
       ├─ IndexZapRouter.buyTargetBasketFor → adapter.swapExactInput
       └─ AccretiveIndex.seed (fee-free @ ~$1 NAV)

  └─ IndexLauncher.initializeMarket
       ├─ IndexFeeHook.registerPool
       ├─ PoolManager.initialize (sqrtPrice from SqrtPriceLib)
       └─ ILiquidityMinter.mintFullRange → NFT to creator
            (LocalPositionManager | V4PositionMinter → modifyLiquidities)

Live loop
  ├─ mintExactShares / Zap mintExactSharesWithUSDC
  ├─ redeem (in-kind primary) / Zap redeemToUSDC (secondary)
  ├─ V4 swaps → IndexFeeHook (5 bps USDC) + 5 bps LP fee in pool
  ├─ sweepFees → treasury / engine
  └─ AccretionEngine.harvest → depositAccretion (0 shares)
```

## Adapter allowlist

- Callers: `router` (Zap) **or** `factory.isEngine(caller)`
- Pools: guardian-registered constituent/USDC `PoolKey`s only
- `unlockCallback`: only PoolManager; fixed `SwapRequest` ABI — no arbitrary callee

## Hook permissions (CREATE2)

Flags mined into address via `HookMiner.indexFeeHookFlags()`:

- `beforeInitialize`, `beforeSwap`, `afterSwap`
- `beforeSwapReturnDelta`, `afterSwapReturnDelta`

`beforeInitialize` reverts unless launcher registered the `PoolId`. Exact-out rejected. Guardian may `setFeeTakeDisabled(true)`.

## Factory wiring

1. Guardian `approveAsset(asset, priceFeed)` — **policy: no FoT**
2. Launcher `createIndex(...)`
3. Clones + init index/engine; `isEngine[engine]=true` for adapter allowlist

## Harvest / worst-leg / UsdWad

```
usdcFor[i]  = mulDiv(engineUsdc, launchWeightBps[i], 10_000)
bought[i]   = adapter.swapExactInput(USDC, asset[i], usdcFor[i], minOut[i], deadline)
scale       = min_i (bought[i] * WAD / tracked[i])
recognized  = tracked[i] * scale / WAD
usdWad      = NavLib.navWad(recognized, 18, factoryFeeds, 8)
index.depositAccretion(recognized, usdWad)   // ZERO mint; UsdWad display accrual
```

**Assumption:** engine is the sole trusted caller; it prices recognized amounts from factory
`priceFeedOf` + NavLib. Vault does not invent a fee path — it only adds the passed increment.
Stale/non-positive feeds revert harvest (MAY block harvest per spec). Redeem never reads feeds.

## Trust boundaries

- **Untrusted:** EOAs calling mint/redeem/syncLoss/harvest/sweep; raw donations
- **Trusted:** factory admin/guardian, launcher, treasury, configured adapter/hook
- **Vault math:** in-kind only; no price feed on mint/redeem
- **NAV feeds:** seed share sizing / display / future gating — never redeem rights

## Sepolia-only gaps

- Live B20 creation + constituent/USDC pool seeding
- Broadcast deploy/launch/demo scripts against real V4 addresses
- Fork/Sepolia integration against live PoolManager (local loop covered in `OmnibitLoop.t.sol`)
- Constituent pool seeding (`SeedConstituentPools`) still stub — needs live V4 mint encoding
