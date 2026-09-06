# Security notes — AccretiveIndex core

**Status: UNAUDITED.** Do not use with mainnet value.

## Trust boundaries

| Actor | Power |
|-------|-------|
| `launcher` | One-shot `seed` |
| `accretionEngine` | `depositAccretion` (increases tracked, no mint) |
| `protocolTreasury` | Receives fee shares; can redeem like any holder |
| Public | `mintExactShares`, `redeem`, `syncLoss`, ERC-20 transfers |
| Anyone | Can donate tokens; donations are **not** tracked |

Critical addresses are fixed at `initialize` (no setters in this core).

## Roles & access control

- Custom errors; no OZ AccessControl in this contract (role = address equality).
- Implementation constructor calls `_disableInitializers()` so the impl cannot be initialized.
- Clones must be initialized exactly once.

## Hard invariants

1. `trackedBalance[i] <= raw balanceOf(vault, i)` after successful state-changing ops.
2. `depositAccretion` never increases `totalSupply`.
3. Only `seed` / `mintExactShares` / `redeem` / `depositAccretion` / `syncLoss` mutate tracked.
4. `syncLoss` never increases tracked.
5. Untracked donations never become tracked automatically.
6. In-kind redeem does not read an oracle or DEX.

## Unsupported tokens

- Fee-on-transfer / deflationary tokens
- Rebasing tokens
- Tokens that fee or fail on `transfer`/`transferFrom` in non-standard ways
- Tokens with callbacks that attempt reentrancy (mitigated by `nonReentrant`, but economic grief still possible)

**Assumption:** upstream Factory registry only approves standard ERC-20 constituents (B20 test assets on Sepolia).

## Asset-flow safety

- `SafeERC20` for all constituent pulls/sends
- `nonReentrant` on `seed`, `mintExactShares`, `redeem`, `depositAccretion`, `syncLoss`
- Checks-effects-interactions ordering within those constraints
- Mint path assumes full `required` amount arrives (no FoT reconciliation)

## Reserved flags

- `mintPaused` — enforced on mint; **no setter** (future guardian/factory)
- `closed` — storage only; **no behavior/setter** yet

## Future risks (out of scope here)

- Malicious or compromised `accretionEngine` / `launcher`
- B20 seize / blacklist → requires `syncLoss` + careful off-chain response
- Hook / harvest economic attacks in the wider system
- Clone initialization front-running if factory does not atomic-init

## What this audit surface is not

This package does not include Factory, Launcher, Hook, Zap, Adapter, or Engine. Integration risk lives in those contracts.
