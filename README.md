# Omnibit Index Forge — Base Sepolia MVP

Solidity `^0.8.26` Foundry project for **Omnibit Index Forge** (Base Batches 004).

> **Local MVP status:** vault / factory / engine / zap / V4 adapter / IndexFeeHook / IndexLauncher + scripts + local integration loop.  
> **Testnet disclaimer:** tNVDA and tMSFT are **synthetic B20 test assets**. They are **not** Coinbase-issued live tokenized stocks.

## Chain — Base Sepolia (84532)

| Dependency | Address |
|------------|---------|
| Chain id | `84532` |
| B20 Factory | `0xB20f000000000000000000000000000000000000` |
| Circle test USDC (6 dec) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Uniswap V4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Uniswap V4 Universal Router | `0x492e6456d9528771018deb9e87ef7750ef184104` |
| Uniswap V4 PositionManager | `0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80` |
| Uniswap V4 StateView | `0x571291b572ed32ce6751a2cb2486ebee8defb9b4` |
| Uniswap V4 Quoter | `0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Protocol addresses (factory, hook, launcher, AI2, feeds) are published after Sepolia broadcast — see `script/DeployProtocol.s.sol` output.

## Product model

1. **AccretiveIndex** — ERC-20 share (18 dec) + custody + `trackedBalance`
2. **AccretionEngine** — swept USDC → harvest at **launch weights** → `depositAccretion` (**zero new shares**)

**Invariant:** `backing per share[i] = trackedBalance[i] / totalSupply`.  
**Accretion** raises backing/share; `totalSupply` unchanged.  
**`cumulativeAccretedUsdWad`:** engine prices recognized amounts via factory feeds + `NavLib` and passes `usdWadIncrement` into `depositAccretion` (UI/NAV only — never redeem rights).

## Fees

| Path | Fee | Paid in | Destination |
|------|-----|---------|-------------|
| Canonical INDEX/USDC swap | 5 bps protocol hook | USDC | `pendingHookUsdc` → sweep 50/50 treasury/engine (odd wei → engine) |
| Same swap LP cut | 5 bps (`fee=500`) | pool units | Stays with LPs |
| Mint / redeem | 10 bps | INDEX shares | protocolTreasury |
| `seed()` | 0 | — | Launcher-only |

## Build & test (local)

```bash
export PATH="$PATH:/home/box/.foundry/bin"
cd /workspace/omnibit
forge fmt
forge build
forge test
```

Optional verbosity: `forge test -vvv`. Integration: `forge test --match-path test/integration/OmnibitLoop.t.sol -vv`.

## Scripts (`script/`)

| Script | Purpose |
|--------|---------|
| `DeployMockFeeds.s.sol` | MockPriceFeed tNVDA=$200, tMSFT=$500 |
| `DeployProtocol.s.sol` | Impls, factory, adapter, zap, mined hook, launcher; wire roles |
| `LaunchAI2.s.sol` | createSeed + initializeMarket placeholders (env comments) |
| `DemoAccretion.s.sol` | sweep → harvest → redeem narrative |
| `DeployTestB20s.s.sol` | **Stub** — live B20 Factory only |
| `SeedConstituentPools.s.sol` | **Stub** — live V4 PoolManager/PositionManager |

Scripts **compile** locally. **`--broadcast` is Sepolia-only** (needs keys + live B20/V4). Do not imply anvil hosts B20 precompiles.

### Sepolia launch guide

Step-by-step wallet / deploy / `NEXT_PUBLIC_*` / smoke-test checklist: **[`docs/SEPOLIA_LAUNCH.md`](docs/SEPOLIA_LAUNCH.md)** (also in the web docs UI at `/docs/sepolia-launch` after `copy-docs`).

### Remaining Sepolia broadcast steps

1. Create tNVDA / tMSFT via B20 Factory (`DeployTestB20s` stub).
2. Deploy mock feeds; guardian `approveAsset`.
3. Seed tNVDA/USDC + tMSFT/USDC V4 pools; `adapter.registerPool`.
4. `DeployProtocol` with `--broadcast` on 84532 (mine hook via CREATE2 deployer).
5. `LaunchAI2` two txs; trade to accrue hook USDC.
6. `DemoAccretion`: sweep → harvest → redeem more basket per share.
7. Publish addresses; frontend against Sepolia.

## Layout

```
src/core/          AccretiveIndex.sol  IndexFactory.sol
src/accretion/     AccretionEngine.sol
src/launch/        IndexLauncher.sol
src/periphery/     IndexZapRouter.sol  UniswapV4SwapAdapter.sol
src/fees/          IndexFeeHook.sol
src/libs/          NavLib.sol  SqrtPriceLib.sol  HookMiner.sol
src/testnet/       MockPriceFeed.sol
test/unit|fuzz|invariant|integration/
test/harness/      LocalPoolManager.sol  LocalPositionManager.sol
script/            Deploy* LaunchAI2 DemoAccretion
docs/              ARCHITECTURE ACCOUNTING SECURITY GLOSSARY
```

## Security assumptions

- Constituents: standard ERC-20, **no FoT** (factory guardian policy)
- Adapter allowlist: Zap + `factory.isEngine`; registered constituent/USDC pools only
- Hook MUST be CREATE2/`HookMiner` mined
- **UNAUDITED** — testnet only

## Dependencies

- OpenZeppelin Contracts + Upgradeable
- Uniswap v4-core (+ periphery for HookMiner reference)
- forge-std

## License

MIT

## Frontend (MVP website)

Next.js App Router console lives in **`apps/web`** (Base Sepolia only). Scope is a **testnet console**, not a marketing site.

- Local / Vercel: see [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Vercel **Root Directory:** `apps/web`
- Env template: `apps/web/.env.example`
- Docs in the UI are copied from this repo’s `docs/*.md` + root README at build time (`apps/web/scripts/copy-docs.js`) — do not maintain drifting duplicates in the frontend.
