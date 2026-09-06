# Base Sepolia launch guide — Omnibit Index Forge

**UNAUDITED — Base Sepolia testnet only (chain id `84532`).**  
Do not use with mainnet value. tNVDA / tMSFT are **synthetic B20 test assets**, not Coinbase-issued live tokenized stocks.

This guide is the ordered checklist for Suepaphly to deploy, wire the frontend, and smoke-test. Companion: [`RUNBOOK.md`](./RUNBOOK.md) (local forge + Vercel). Security posture: [`SECURITY.md`](./SECURITY.md).

---

## 0. Prerequisites

| Need | Detail |
|------|--------|
| Wallet | Deployer / guardian / creator (can be same EOA for MVP). Prefer a dedicated Sepolia hot wallet. |
| ETH (Base Sepolia) | Gas for deploys + txs. Fund via a Base Sepolia faucet. |
| USDC (6-dec Circle test) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` — enough for seed backing + LP (e.g. ≥ 1,050 USDC for defaults: 1000 seed + 50 LP). |
| Tooling | Foundry (`forge`, `cast`), `export PATH="$PATH:/home/box/.foundry/bin"`. Node 20+ for `apps/web`. |
| RPC | Base Sepolia HTTPS RPC (Alchemy / QuickNode / public). |
| Keys | `PRIVATE_KEY` for broadcast scripts — **never commit**. Do **not** `git push` secrets. |
| WalletConnect | Project id from [cloud.walletconnect.com](https://cloud.walletconnect.com) for the web console. |

**Known Base Sepolia addresses (re-check Uniswap / Circle docs before broadcast):**

| Dependency | Address |
|------------|---------|
| Chain id | `84532` |
| B20 Factory | `0xB20f000000000000000000000000000000000000` |
| Circle test USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| V4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| V4 PositionManager | `0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80` |
| V4 Universal Router | `0x492e6456d9528771018deb9e87ef7750ef184104` |
| V4 StateView | `0x571291b572ed32ce6751a2cb2486ebee8defb9b4` |
| V4 Quoter | `0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| CREATE2 deployer (hook mine) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

---

## 1. Local gate (before any broadcast)

```bash
export PATH="$PATH:/home/box/.foundry/bin"
cd /workspace/omnibit   # or your clone root
forge fmt
forge build
forge test
```

Expect **102 passed / 0 failed** (unit + fuzz + invariant + local integration). Do **not** broadcast if this fails.

---

## 2. Deploy order (scripts)

Scripts live in `script/`. Several are **stubs** until live B20 / V4 are used. Broadcast is **Sepolia-only** — do not imply plain anvil hosts B20 precompiles.

| Step | Script | What you do | Record |
|------|--------|-------------|--------|
| 1 | `DeployTestB20s.s.sol` | **Stub.** Create tNVDA / tMSFT via live B20 Factory (`createB20` ASSET, test-only labels, 18 dec, no FoT / unpaused). | `T_NVDA`, `T_MSFT` → `NEXT_PUBLIC_TNVDA`, `NEXT_PUBLIC_TMSFT` |
| 2 | `DeployMockFeeds.s.sol` | Deploy `MockPriceFeed` ($200 tNVDA, $500 tMSFT, 8-dec answers). | feed addresses |
| 3 | `DeployProtocol.s.sol` | Enable `vm.startBroadcast` / stop; mine `IndexFeeHook` with **CREATE2 deployer** as salt finder (not the dry-run `address(this)`). Deploys impls, factory, adapter, zap, hook, launcher; wires launcher on factory + hook; sets USDC/treasury on hook. | factory, adapter, zap, hook, launcher, treasury, impls |
| 4 | Guardian ops | `factory.approveAsset(tNVDA, feedNVDA)`, `approveAsset(tMSFT, feedMSFT)`. | — |
| 5 | `SeedConstituentPools.s.sol` | **Stub.** Initialize + seed full-range LP for **tNVDA/USDC** and **tMSFT/USDC** on live V4 (Permit2 approvals as required). | PoolKeys |
| 6 | Adapter pools | `UniswapV4SwapAdapter.registerPoolKey` for each constituent/USDC pair (guardian). Ensure zap/engine can swap. | — |
| 7 | Sync adapters | `factory.setSwapAdapter(adapter)` already done in DeployProtocol; for any **existing** engines created earlier, call `AccretionEngine.setSwapAdapter` via factory owner pattern if needed. Zap: `setSwapAdapter` if redeployed. Adapter: `setRouter(zap)`. | — |
| 8 | `LaunchAI2.s.sol` Tx1 | Approve USDC → `IndexLauncher.createSeed` (50/50 weights, backing USDC). | `AI2_INDEX`, `AI2_ENGINE`, grossShares → `NEXT_PUBLIC_AI2_INDEX`, `NEXT_PUBLIC_AI2_ENGINE` |
| 9 | `LaunchAI2.s.sol` Tx2 | Approve USDC + INDEX → `initializeMarket`. **See §2.1 PositionManager note.** | `PoolId` → `NEXT_PUBLIC_AI2_POOL_ID`, position NFT to creator |
| 10 | Trade + `DemoAccretion.s.sol` | Exact-in swaps on canonical AI2/USDC (hook accrues USDC) → `sweepFees` → `harvest` → redeem more basket/share. | demo tx hashes |

### 2.1 PositionManager compatibility (S-01 fixed)

`IndexLauncher` calls `ILiquidityMinter.mintFullRange(...)`.

| Environment | Implementation |
|-------------|----------------|
| Foundry tests | `LocalPositionManager` (pull + fake NFT id) |
| Base Sepolia | `V4PositionMinter` — Permit2 allowance + encodes `MINT_POSITION` + `CLOSE_CURRENCY` x2 → `PositionManager.modifyLiquidities` |

`DeployProtocol` deploys `V4PositionMinter(POSITION_MANAGER, PERMIT2, POOL_MANAGER)` and passes that address into `IndexLauncher` as `liquidityMinter`. **Do not** pass the raw PositionManager address to the launcher.

Residual Sepolia checks:
1. Confirm `launcher.liquidityMinter()` is the deployed `V4PositionMinter`, not the Uniswap PM.
2. Constituent pool seeding (`SeedConstituentPools`) is still a stub — needs the same encoding/Permit2 path for tNVDA/USDC and tMSFT/USDC.
3. `createSeed` now requires caller-supplied `minAmountsOut[]` (length == constituents). Zeros are allowed for controlled demos; set real mins before valued use.

### 2.2 Hook mining checklist

1. Compute salt with `HookMiner.find(CREATE2_DEPLOYER, flags, creationCode, abi.encode(poolManager))`.
2. Deploy via CREATE2 deployer so permission bits match `IndexFeeHook.getHookPermissions()`.
3. Wrong bits ⇒ wasted deploy; PoolManager will reject the hook.

### 2.3 Verify you deployed the right contracts

```bash
# Example checks (fill addresses)
cast call $FACTORY "indexImplementation()(address)" --rpc-url $RPC
cast call $FACTORY "engineImplementation()(address)" --rpc-url $RPC
cast call $FACTORY "usdc()(address)" --rpc-url $RPC
cast call $FACTORY "launcher()(address)" --rpc-url $RPC
cast call $HOOK "poolManager()(address)" --rpc-url $RPC
cast call $HOOK "launcher()(address)" --rpc-url $RPC
cast call $HOOK "usdc()(address)" --rpc-url $RPC
cast call $ADAPTER "factory()(address)" --rpc-url $RPC
cast call $ADAPTER "router()(address)" --rpc-url $RPC
cast call $AI2 "seeded()(bool)" --rpc-url $RPC
cast call $AI2 "constituents()(address[])" --rpc-url $RPC
cast call $FACTORY "isIndex(address)(bool)" $AI2 --rpc-url $RPC
cast call $FACTORY "engineOf(address)(address)" $AI2 --rpc-url $RPC
```

Confirm: USDC + PoolManager match §0 table; launcher on factory **and** hook; adapter router = zap; AI2 constituents = tNVDA/tMSFT; `isEngine(engine) == true`.

---

## 3. Fill `NEXT_PUBLIC_*` and Vercel

Template: `apps/web/.env.example` → `.env.local` (local) and Vercel Project Env (Production + Preview).

| Variable | When / source |
|----------|----------------|
| `NEXT_PUBLIC_CHAIN_ID` | `84532` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud |
| `NEXT_PUBLIC_USDC_ADDRESS` | Circle test USDC (default in example) |
| `NEXT_PUBLIC_INDEX_FACTORY` | DeployProtocol |
| `NEXT_PUBLIC_INDEX_LAUNCHER` | DeployProtocol |
| `NEXT_PUBLIC_INDEX_FEE_HOOK` | DeployProtocol (mined) |
| `NEXT_PUBLIC_INDEX_ZAP_ROUTER` | DeployProtocol |
| `NEXT_PUBLIC_SWAP_ADAPTER` | DeployProtocol |
| `NEXT_PUBLIC_PROTOCOL_TREASURY` | DeployProtocol / `PROTOCOL_TREASURY` env |
| `NEXT_PUBLIC_TNVDA` / `NEXT_PUBLIC_TMSFT` | DeployTestB20s |
| `NEXT_PUBLIC_AI2_INDEX` | LaunchAI2 Tx1 |
| `NEXT_PUBLIC_AI2_ENGINE` | LaunchAI2 Tx1 / `factory.engineOf` |
| `NEXT_PUBLIC_AI2_POOL_ID` | Tx2 `PoolId` (bytes32 hex) |
| `NEXT_PUBLIC_V4_POOL_MANAGER` | Known (default in example) |
| `NEXT_PUBLIC_V4_UNIVERSAL_ROUTER` | Known |
| `NEXT_PUBLIC_V4_STATE_VIEW` | Known |
| `NEXT_PUBLIC_V4_QUOTER` | Known |

### Vercel

1. Import repo; **Root Directory = `apps/web`**.
2. Framework: Next.js; `prebuild` runs `scripts/copy-docs.js` (copies docs including this file into `content/`).
3. Set all `NEXT_PUBLIC_*` above.
4. Deploy; open `/docs/sepolia-launch` and confirm markdown renders.

Missing addresses ⇒ UI disables txs for that screen (banner). Views may still load when AI2 is set.

---

## 4. Smoke-test checklist

Connect Coinbase Wallet / injected / WalletConnect on **Base Sepolia only**.

| # | Screen / action | Pass criteria |
|---|-----------------|---------------|
| 1 | Overview | Address pills show configured vs unset |
| 2 | Launch Tx1 | USDC approve → createSeed → AI2 minted to creator, `seeded=true` |
| 3 | Launch Tx2 | initializeMarket (or manual LP path) → pool registered on hook, LP NFT to creator |
| 4 | Vault | tracked ≤ raw; totalSupply; cumulativeAccretedUsdWad; nav display |
| 5 | Mint | previewMint; in-kind `mintExactShares`; optional zap USDC |
| 6 | Trade | Exact-in AI2↔USDC; UI shows **5 bps LP** vs **5 bps hook** separately; `pendingHookUsdc` rises |
| 7 | Accretion | `sweepFees` → treasury + engine USDC 50/50 (odd wei → engine); `harvest` supply flat, tracked up |
| 8 | Redeem | previewRedeem; in-kind redeem; post-harvest redeem gets **more** basket/share than pre-harvest |
| 9 | Docs | `/docs/sepolia-launch`, security, runbook render from `content/` |
| 10 | Disclaimer | Footer: testnet / synthetic B20s |

**Trade note:** Universal Router calldata in the MVP UI may be minimal. If `execute` reverts, confirm pool init and trade via Uniswap UI against the same PoolKey; economics still hold.

---

## 5. Common failures

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tx buttons grey | Missing `NEXT_PUBLIC_*` | Fill env; redeploy Vercel |
| WalletConnect dead | Empty project id | Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |
| Wrong network | Not 84532 | Switch to Base Sepolia |
| createSeed reverts | Assets not approved, adapter pools missing, low USDC, deadline, adapter unset | approveAsset; registerPoolKey; fund USDC; check zap↔adapter |
| initializeMarket reverts | Not creator/owner; not seeded; already initialized; bad LP amounts; minter miswired | Confirm `liquidityMinter` is V4PositionMinter; see §2.1 |
| Hook init rejected | Pool not registered / wrong hook address bits | registerPool before initialize; remine hook |
| mint reverts | Not seeded; missing constituent approve; FoT token | Seed first; approve ERC-20s; never approve FoT |
| zap mint underfills | `minOut=0` / thin pools / equal USDC split heuristic | Deepen constituent pools; use in-kind mint |
| sweepFees reverts | `NoPendingFees` / unset USDC or treasury on hook | Trade first; `setUsdc` / `setProtocolTreasury` |
| harvest reverts | No engine USDC; bad minOut; missing/non-positive feeds; adapter | Sweep first; set feeds; register pools |
| Docs missing Sepolia page | copy-docs / GUIDE_META not updated | Ensure `SEPOLIA_LAUNCH.md` in copy-docs + `docs.ts`; rerun prebuild |
| tracked > raw | Unexpected seize / FoT | `syncLoss`; operational response |

---

## 6. Security & ops reminders (testnet)

- **UNAUDITED.** Testnet demo only.
- Guardian MUST NOT `approveAsset` fee-on-transfer / rebasing / blacklisting tokens (policy, not on-chain probe).
- In-kind `redeem` does **not** use price feeds; stale feeds may block zap/harvest only.
- `createSeed` requires caller-supplied `minAmountsOut[]` (zeros OK for controlled Sepolia demos). Zap redeem/mint paths may still use zero mins — tighten before valued use.
- Do **not** git push private keys or `.env.local`.
- Do **not** broadcast from CI without explicit human approval.

---

## 7. After successful demo

1. Publish addresses (README table or deployment gist).
2. Keep frontend env in sync.
3. Record DemoAccretion tx hashes for Base Batches narrative.
4. File follow-ups: live PositionManager wrapper, non-zero slippage on launcher/zap, `mintPaused` setter if ops need it.
