# Security notes — AccretiveIndex + Factory + Engine

**Status: UNAUDITED.** Do not use with mainnet value.

## Trust boundaries

| Actor | Power |
|-------|-------|
| Factory `DEFAULT_ADMIN_ROLE` | Set launcher / treasury / swapAdapter; grant guardian |
| Factory `GUARDIAN_ROLE` | `approveAsset` / `setPriceFeed` / `revokeAsset` |
| `launcher` | `createIndex` (factory); one-shot `seed` (vault) |
| `accretionEngine` | `depositAccretion(amounts, usdWadIncrement)` (increases tracked + UsdWad, no mint) |
| `protocolTreasury` | Receives fee shares; can redeem like any holder |
| Public | `mintExactShares`, `redeem`, `syncLoss`, `harvest`, ERC-20 transfers |
| Anyone | Can donate tokens; donations are **not** tracked |

Vault role addresses are fixed at `initialize` (no setters on AccretiveIndex).

## Roles & access control

- **IndexFactory:** OZ `AccessControl` + `onlyLauncher` on `createIndex`.
- **AccretiveIndex / AccretionEngine:** address equality; impl constructors call `_disableInitializers()`.
- Clones must be initialized exactly once (factory does this atomically in `createIndex`).

## Hard invariants

1. `trackedBalance[i] <= raw balanceOf(vault, i)` after successful state-changing ops.
2. `depositAccretion` / `harvest` never increase `totalSupply`.
3. Only `seed` / `mintExactShares` / `redeem` / `depositAccretion` / `syncLoss` mutate tracked.
4. `syncLoss` never increases tracked.
5. Untracked donations never become tracked automatically.
6. In-kind redeem does not read an oracle or DEX.
7. `createIndex` is launcher-only.

## Unsupported tokens / FoT policy

- Fee-on-transfer / deflationary / rebasing / non-standard ERC-20s are **unsupported**.
- **Registry policy (IndexFactory):** guardian MUST NOT `approveAsset` FoT tokens. Rejection is **policy-level**, not an on-chain transfer probe (MVP). Documented on `approveAsset` NatSpec.

## Asset-flow safety

- `SafeERC20` / `forceApprove` for pulls, sends, and adapter/index allowances
- `nonReentrant` on vault mutators and `harvest`
- Mint path assumes full `required` amount arrives (no FoT reconciliation)
- Harvest leftovers (constituents + USDC dust) remain in the engine by design

## Reserved flags

- `mintPaused` — enforced on mint; **no setter** on vault (future guardian/factory)
- `closed` — storage only; **no behavior/setter** yet

## Future risks (partially out of scope)

- Malicious/compromised launcher, guardian, or swap adapter
- Production adapter allowlist / unlock callback (interface only today)
- B20 seize / blacklist → `syncLoss` + off-chain response
- Hook / sweep economic attacks (hook not implemented)
- Clone init front-running if a non-factory deployer clones without atomic init

## UsdWad trust

Engine-computed `usdWadIncrement` is trusted display accounting. A compromised engine could inflate
`cumulativeAccretedUsdWad` without changing redeemable basket (tracked still requires real tokens).

## What this audit surface still excludes

Sepolia live B20 / V4 broadcast verification, production PositionManager calldata, frontend.
