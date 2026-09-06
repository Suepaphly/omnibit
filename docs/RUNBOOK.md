# Runbook — Omnibit Index Forge (Base Sepolia + Web MVP)

Website scope: **MVP test console only** (not a marketing site). Chain: **Base Sepolia `84532`**.

## 1. Local forge test

```bash
export PATH="$PATH:/home/box/.foundry/bin"
cd /workspace/omnibit
forge fmt
forge build
forge test
```

Integration loop:

```bash
forge test --match-path test/integration/OmnibitLoop.t.sol -vv
```

## 2. Sepolia deploy order

Scripts compile locally; **`--broadcast` is Sepolia-only** (keys + live B20/V4).

1. **Create test B20s** — `script/DeployTestB20s.s.sol` (stub against live B20 Factory `0xB20f…0000`). Record `T_NVDA`, `T_MSFT`.
2. **Mock feeds** — `script/DeployMockFeeds.s.sol` (tNVDA=$200, tMSFT=$500). Guardian `approveAsset` on factory.
3. **Seed constituent/USDC pools** — `script/SeedConstituentPools.s.sol` (stub); `adapter.registerPool` for each pair.
4. **Deploy protocol** — `script/DeployProtocol.s.sol --broadcast` on `84532` (impls, factory, adapter, zap, CREATE2-mined hook, launcher; wire roles). Record factory, launcher, hook, zap, adapter, treasury.
5. **Launch AI2** — `script/LaunchAI2.s.sol` two txs:
   - Tx1 `createSeed` (env: `INDEX_LAUNCHER`, `T_NVDA`, `T_MSFT`, `BACKING_USDC`, …)
   - Tx2 `initializeMarket` (env: `INDEX_AI2`, `LP_USDC`, …)
   Record `NEXT_PUBLIC_AI2_INDEX`, `NEXT_PUBLIC_AI2_ENGINE`, `NEXT_PUBLIC_AI2_POOL_ID`.
6. **Demo accretion** — trade to accrue hook USDC, then `script/DemoAccretion.s.sol` (sweep → harvest → redeem narrative).
7. Publish addresses into frontend env.

See root `README.md` for known V4 / USDC addresses on Base Sepolia.

## 3. Fill frontend `NEXT_PUBLIC_*`

In `apps/web/.env.local` (from `.env.example`):

| Variable | Source |
|----------|--------|
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `NEXT_PUBLIC_USDC_ADDRESS` | Circle test USDC (default in example) |
| `NEXT_PUBLIC_INDEX_FACTORY` | DeployProtocol |
| `NEXT_PUBLIC_INDEX_LAUNCHER` | DeployProtocol |
| `NEXT_PUBLIC_INDEX_FEE_HOOK` | DeployProtocol (mined) |
| `NEXT_PUBLIC_INDEX_ZAP_ROUTER` | DeployProtocol |
| `NEXT_PUBLIC_SWAP_ADAPTER` | DeployProtocol |
| `NEXT_PUBLIC_PROTOCOL_TREASURY` | DeployProtocol / admin |
| `NEXT_PUBLIC_AI2_INDEX` | LaunchAI2 createSeed |
| `NEXT_PUBLIC_AI2_ENGINE` | LaunchAI2 / factory.engineOf |
| `NEXT_PUBLIC_AI2_POOL_ID` | initializeMarket `PoolId` (bytes32) |
| `NEXT_PUBLIC_TNVDA` / `NEXT_PUBLIC_TMSFT` | DeployTestB20s |
| `NEXT_PUBLIC_V4_*` | Known Sepolia V4 addresses (defaults in example) |

If an address is missing, the UI **disables txs** for that screen with a clear banner (views may still load when AI2 is set).

## 4. Vercel project setup

1. Import the Git repo.
2. Set **Root Directory** to `apps/web`.
3. Framework preset: Next.js.
4. Install / build: use the package scripts in `apps/web/package.json` (`prebuild` runs `scripts/copy-docs.js` so `content/` has ARCHITECTURE, ACCOUNTING, SECURITY, GLOSSARY, README, RUNBOOK).
5. Add all `NEXT_PUBLIC_*` env vars (Production + Preview).
6. Deploy. Confirm docs routes render markdown from `content/`, not hardcoded copies.

`vercel.json` lives under `apps/web`.

## 5. Smoke-test each screen

Connect **Coinbase Wallet**, **injected**, or **WalletConnect** on Base Sepolia only.

| Screen | Check |
|--------|--------|
| Overview | Address pills show configured vs unset |
| Launch | Approve USDC → createSeed → paste index → approve AI2 → initializeMarket |
| Vault | totalSupply, tracked vs raw, cumulativeAccretedUsdWad, navPerShare display |
| Mint | previewMint numbers; in-kind mintExactShares; zap USDC path |
| Trade | LP 5 bps vs hook 5 bps shown separately; approve + exact-in (see note below) |
| Accretion | pendingHookUsdc, engine USDC, sweepFees, harvest |
| Redeem | previewRedeem + in-kind redeem |
| Docs | Each markdown page matches repo docs |
| Disclaimer | Persistent footer: synthetic tNVDA/tMSFT, not live Coinbase stocks |

**Trade note:** Universal Router V4 calldata in the MVP is minimal. If `execute` reverts, verify pool init and use Uniswap’s UI against the same pool; fee breakdown remains valid for economics.

## 6. Common failures

| Symptom | Likely cause |
|---------|----------------|
| Tx buttons grey / banner | Missing `NEXT_PUBLIC_*` for that screen |
| WalletConnect missing | Empty `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Wrong network | Switch to Base Sepolia 84532 |
| createSeed reverts | Assets not approved, pools unregistered, insufficient USDC, deadline |
| initializeMarket reverts | Not creator/owner, not seeded, already initialized, bad LP amounts |
| mint reverts | Not seeded, mintPaused, missing constituent approvals, FoT (unsupported) |
| zap mint reverts | Adapter unset, insufficient USDC / slippage, pools not registered |
| sweepFees reverts | `NoPendingFees` or pool not registered |
| harvest reverts | No engine USDC, adapter/pools, bad minOut, stale/missing feeds |
| redeem reverts | Insufficient shares, not seeded |
| Docs empty / stub | `prebuild` copy-docs did not run or `docs/RUNBOOK.md` missing at build |
| Build fails on markdown | Ensure `content/` present after copy-docs |

## 7. Security reminder

**UNAUDITED — testnet only.** Do not use with mainnet value.
