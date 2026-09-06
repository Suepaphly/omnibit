# Omnibit Index Forge — AccretiveIndex Core

Solidity `^0.8.26` Foundry project implementing **only** the `AccretiveIndex` vault/share token for Omnibit Index Forge (Base Sepolia MVP).

> **Scope:** `AccretiveIndex` core only. Factory, Launcher, Uniswap V4 hook, ZapRouter, swap adapter, and AccretionEngine are **not** implemented here.

## Product model

Each `AccretiveIndex` clone is:

1. An **ERC-20 index share** (18 decimals)
2. A **custody vault** for constituent ERC-20s
3. A **recognized-backing ledger** (`trackedBalance`)

**Key invariant:** `backing per share[i] = trackedBalance[i] / totalSupply`.

**Accretion** deposits constituents **without minting**, so backing per share rises while `totalSupply` stays unchanged.

## Tracked vs raw

| Concept | Meaning |
|--------|---------|
| **Raw balance** | `IERC20(asset).balanceOf(vault)` |
| **Recognized backing (`trackedBalance`)** | Protocol ledger used for mint/redeem/accretion math |

Direct ERC-20 transfers into the vault (**untracked donations**) do **not** become backing. Only these functions mutate `trackedBalance`:

- `seed`
- `mintExactShares`
- `redeem`
- `depositAccretion`
- `syncLoss` (decrease only)

After every successful state-changing op: `trackedBalance[asset] <= raw balance`.

## Flows

### Seed (launcher-only, once, fee-free)

Pulls constituent amounts from the launcher, sets `trackedBalance`, mints `initialGrossShares` to `lpReceiver`. Treasury gets **0** fee shares.

### Mint (`mintExactShares`)

```
requiredAsset[i] = mulDiv(tracked[i], grossShares, totalSupplyBefore, Ceil)
feeShares        = floor(grossShares * mintFeeBps / 10_000)
userShares       = grossShares - feeShares
```

Pulls assets from caller, increases tracked by recognized amounts, mints user shares to `receiver` and fee shares to `protocolTreasury`. Reverts if `!seeded` or `mintPaused`.

### Redeem

```
feeShares    = floor(sharesIn * redeemFeeBps / 10_000)
redeemShares = sharesIn - feeShares
assetOut[i]  = mulDiv(tracked[i], redeemShares, totalSupplyBefore, Floor)
```

Transfers fee shares to treasury, burns `redeemShares`, reduces tracked, sends constituents. Works while `mintPaused`. No oracle/DEX.

### Accretion (`depositAccretion`)

AccretionEngine-only. Pulls amounts, `+= tracked` and `+= cumulativeAccretedRaw`. **Never mints.** `cumulativeAccretedUsdWad` is **not** updated in this core (no oracle).

### syncLoss

Permissionless. If `raw < tracked`, set `tracked = raw`. Never increases. Donations never become tracked.

## Fees & rounding

- Mint/redeem fees are paid in **index shares** to `protocolTreasury` (fully backed), never USDC.
- Mint required amounts use **Ceil**; redeem outputs use **Floor**.
- `previewMint` / `previewRedeem` share the same internal helpers as the state-changing paths (no drift).

## Security assumptions

- Constituents are standard ERC-20s: **no fee-on-transfer**, no rebasing, no weird callbacks that break CEI beyond `nonReentrant` + `SafeERC20`.
- Upstream registry (future Factory) approves assets; this vault does not validate token behavior at runtime.
- Roles (`launcher`, `accretionEngine`, `protocolTreasury`, `factory`) are trusted as configured at `initialize`.
- `mintPaused` / `closed` are **storage-reserved**; this contract has **no setters** (future factory/guardian).
- **UNAUDITED.**

## NOT implemented

- `IndexFactory`, `IndexLauncher`, `IndexZapRouter`, `UniswapV4SwapAdapter`, `IndexFeeHook`, `AccretionEngine`
- Oracle update of `cumulativeAccretedUsdWad`
- Governance, rebalance, oracle-based redemption
- UUPS upgrades beyond clone `initialize`

## Layout

```
src/core/AccretiveIndex.sol
test/unit/AccretiveIndex.t.sol
test/fuzz/AccretiveIndex.fuzz.t.sol
test/invariant/AccretiveIndex.invariant.t.sol
test/mocks/MockERC20.sol
docs/{ARCHITECTURE,ACCOUNTING,SECURITY,GLOSSARY}.md
```

## Build & test

```bash
export PATH="$PATH:/home/box/.foundry/bin"
cd /workspace/omnibit
forge fmt
forge build
forge test -vvv
# optional:
forge test --gas-report
```

## Dependencies

- OpenZeppelin Contracts + Upgradeable (Clones, Initializable ERC20, ReentrancyGuard, SafeERC20, Math)
- forge-std

## License

MIT
