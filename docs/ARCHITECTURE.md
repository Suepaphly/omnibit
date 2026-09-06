# Architecture — Omnibit Index Forge (current phase)

## Implemented now

| Component | Path | Role |
|-----------|------|------|
| **AccretiveIndex** | `src/core/AccretiveIndex.sol` | Share token + custody + tracked ledger |
| **IndexFactory** | `src/core/IndexFactory.sol` | Asset registry; clones index + engine; `onlyLauncher` create |
| **AccretionEngine** | `src/accretion/AccretionEngine.sol` | USDC hold; harvest at launch weights; worst-leg depositAccretion |
| **NavLib** | `src/libs/NavLib.sol` | WAD NAV from tracked + 8-dec feeds |
| **MockPriceFeed** | `src/testnet/MockPriceFeed.sol` | AggregatorV3 mock |
| **IUniswapV4SwapAdapter** | `src/periphery/interfaces/…` | Exact-in swap surface (mock in tests) |

## System diagram (target vs done)

```
Creator
  └─ IndexLauncher.createSeed          ← NOT IMPLEMENTED
       ├─ IndexFactory.createIndex     ← DONE (clones + init + registry)
       ├─ Zap / SwapAdapter buy basket ← NOT IMPLEMENTED (interface + MockSwapAdapter only)
       └─ AccretiveIndex.seed          ← DONE (vault)

  └─ IndexLauncher.initializeMarket    ← NOT IMPLEMENTED
       ├─ IndexFeeHook.register        ← NOT IMPLEMENTED
       └─ V4 PoolManager.initialize    ← NOT IMPLEMENTED

Live loop
  ├─ mintExactShares / redeem          ← DONE
  ├─ V4 swaps → IndexFeeHook           ← NOT IMPLEMENTED
  ├─ sweepFees → treasury / engine     ← NOT IMPLEMENTED
  └─ AccretionEngine.harvest           ← DONE (unit-tested w/ MockSwapAdapter)
       └─ depositAccretion (0 shares)  ← DONE
```

## Factory wiring

1. Guardian `approveAsset(asset, priceFeed)` — **policy: no FoT tokens**
2. Launcher `createIndex({name, symbol, constituents, initialWeightsBps, creator})`
3. Factory clones index impl + engine impl
4. `AccretiveIndex.initialize(..., factory, launcher, engine, treasury, 10, 10)`
5. `AccretionEngine.initialize(index, factory, usdc, swapAdapter, launchWeightsBps)`
6. Registry: `isIndex`, `isEngine`, `engineOf[index]`, `_indexes[]`

`isEngine` is the allowlist hook for a future production adapter (“registers the new engine as an allowed adapter caller”).

## Harvest / worst-leg

```
usdcFor[i]  = mulDiv(engineUsdc, launchWeightBps[i], 10_000)
bought[i]   = adapter.swapExactInput(USDC, asset[i], usdcFor[i], minOut[i], deadline)
scale       = min_i (bought[i] * WAD / tracked[i])   // tracked[i] > 0
recognized  = tracked[i] * scale / WAD                 // capped ≤ bought[i]
index.depositAccretion(recognized)                     // ZERO mint; leftovers stay in engine
```

Launch weights (e.g. 50/50) are the **spend** target. Recognition follows **live tracked proportions**. Vault mix may drift; there is no `rebalance()` in MVP.

## Trust boundaries

- **Untrusted:** EOAs calling mint/redeem/syncLoss/harvest; raw donations
- **Trusted:** factory admin/guardian, launcher, configured treasury, swap adapter (when set)
- **Vault math:** in-kind only; no price feed on mint/redeem
- **NAV feeds:** display / future zap·harvest gating only — never redeem rights

## Still not implemented

- `IndexLauncher`, `IndexZapRouter`, production `UniswapV4SwapAdapter`, `IndexFeeHook`, `SqrtPriceLib`
- Sepolia deploy/launch/demo scripts
- Writing `cumulativeAccretedUsdWad` from harvest (storage reserved on vault; engine does not update it yet)
