# Architecture — AccretiveIndex in the future Omnibit system

This repository currently ships **only** `AccretiveIndex`. The components below are documented for placement; they are **not implemented** here.

## System diagram (target)

```
Creator
  └─ IndexLauncher.createSeed
       ├─ IndexFactory.createIndex → clone AccretiveIndex + AccretionEngine
       ├─ IndexZapRouter / UniswapV4SwapAdapter → buy basket with USDC
       └─ AccretiveIndex.seed (fee-free mint)

  └─ IndexLauncher.initializeMarket
       ├─ IndexFeeHook.register(PoolId)
       └─ Uniswap V4 PoolManager.initialize(AI2/USDC) + LP seed

Live loop
  ├─ mintExactShares / Zap USDC→basket→mint
  ├─ redeem (in-kind)
  ├─ V4 swaps → IndexFeeHook (USDC protocol fee) + LP fee in pool
  ├─ sweepFees → 50% protocolTreasury USDC / remainder AccretionEngine
  └─ AccretionEngine.harvest → buy at launch weights → depositAccretion (zero shares)
```

## Component placement

| Component | Role vs AccretiveIndex |
|-----------|-------------------------|
| **IndexFactory** | Approves constituents; clones index + engine; calls `initialize`; `onlyLauncher` create. |
| **IndexLauncher** | Sole caller of `seed`; two-tx launch; owns hook register + pool init. |
| **AccretionEngine** | Sole caller of `depositAccretion`; holds swept USDC; harvest buys legs. |
| **IndexZapRouter** | Convenience USDC→basket→`mintExactShares`; never bypasses vault solvency. |
| **UniswapV4SwapAdapter** | Allowlisted exact-in swaps for launch/harvest; not used by redeem. |
| **IndexFeeHook** | Global V4 hook; USDC protocol fee; does not mint/burn index shares. |
| **protocolTreasury** | Receives mint/redeem **share** fees and swept USDC half. |
| **Constituents (B20)** | ERC-20 assets in the vault; tracked via ledger, not raw donations. |

## Trust boundaries (core)

- **Untrusted:** any EOA calling `mintExactShares`, `redeem`, `syncLoss`, or transferring tokens into the vault.
- **Trusted roles (set at init):** `launcher`, `accretionEngine`, `protocolTreasury`, `factory` address (informational in this core).
- **Vault math:** in-kind only; no price feed in mint/redeem paths.

## Storage reserved for later control

- `mintPaused` — when true, `mintExactShares` reverts. No setter here.
- `closed` — reserved for wind-down. No behavior/setter here.
