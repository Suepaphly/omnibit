# Omnibit Index Forge — AccretiveIndex + Factory + AccretionEngine

Solidity `^0.8.26` Foundry project for Omnibit Index Forge (Base Sepolia MVP).

> **This phase:** `AccretiveIndex`, `IndexFactory`, `AccretionEngine`, `NavLib`, `MockPriceFeed`, and `IUniswapV4SwapAdapter` (+ test mock).
> **Not yet:** `IndexLauncher`, `IndexZapRouter`, production `UniswapV4SwapAdapter`, `IndexFeeHook`, `SqrtPriceLib`.

## Product model

Each factory-created index is a pair:

1. **AccretiveIndex** — ERC-20 share (18 dec) + custody vault + `trackedBalance` ledger
2. **AccretionEngine** — holds swept USDC; `harvest` buys at **launch weights** and `depositAccretion`s with **zero new shares**

**Key invariant:** `backing per share[i] = trackedBalance[i] / totalSupply`.

**Accretion** increases tracked without minting → backing/share rises, `totalSupply` unchanged.

## Tracked vs raw

| Concept | Meaning |
|--------|---------|
| **Raw balance** | `IERC20(asset).balanceOf(vault)` |
| **Recognized backing (`trackedBalance`)** | Protocol ledger for mint/redeem/accretion |

Direct ERC-20 donations do **not** become backing. Writers: `seed`, `mintExactShares`, `redeem`, `depositAccretion`, `syncLoss` (decrease only).

## IndexFactory

- OZ `Clones` of index + engine implementations
- `createIndex(CreateIndexParams)` — **onlyLauncher**; N ∈ [2,8]; equal-length arrays; no dups; every constituent **approved**; weights sum to 10_000
- Initializes both clones: fees 10/10 bps, factory/launcher/engine/treasury wiring, launch weights on engine
- Registry: `isIndex`, `isEngine`, `engineOf`, `indexes()`
- Guardian-only: `approveAsset` / `setPriceFeed` / `revokeAsset`
- **FoT policy:** fee-on-transfer assets are rejected at **registry policy** (guardian MUST NOT approve FoT). No on-chain FoT probe in MVP.

## AccretionEngine

- Clone-ready `Initializable`; constructor `_disableInitializers`
- Holds USDC; linked to one index; stores `launchWeightsBps`
- `harvest(minOut[], deadline)` — permissionless:
  1. Split engine USDC by launch weights
  2. Buy each leg via `IUniswapV4SwapAdapter.swapExactInput`
  3. Worst-leg recognize vs current `tracked` proportions
  4. `depositAccretion(recognized)` — **must mint zero shares**; leftovers stay in engine

## NavLib / MockPriceFeed

- `NavLib`: WAD NAV helpers from tracked amounts + 8-dec feed answers
- `MockPriceFeed`: AggregatorV3-compatible mock (`decimals = 8`)

## Fees & rounding (vault)

- Mint/redeem fees in **index shares** to `protocolTreasury` (never USDC)
- Mint required: **Ceil**; redeem out: **Floor**
- Hook fee / sweep path is **not** in this phase

## Security assumptions

- Constituents: standard ERC-20, **no FoT** (enforced by factory guardian policy)
- Roles trusted as configured at init / factory admin
- `mintPaused` / `closed` still storage-reserved on the vault (no setters here)
- **UNAUDITED**

## NOT implemented (remaining MVP gaps)

| Component | Status |
|-----------|--------|
| `IndexLauncher` (createSeed + initializeMarket) | Not started |
| `IndexZapRouter` | Not started |
| Production `UniswapV4SwapAdapter` | Interface + test mock only |
| `IndexFeeHook` + CREATE2 mine | Not started |
| `SqrtPriceLib` | Not started |
| Sepolia B20 / V4 integration scripts | Not started |
| Oracle write to `cumulativeAccretedUsdWad` | Reserved / unused |

## Layout

```
src/core/AccretiveIndex.sol IndexFactory.sol
src/accretion/AccretionEngine.sol
src/libs/NavLib.sol
src/testnet/MockPriceFeed.sol
src/periphery/interfaces/IUniswapV4SwapAdapter.sol
test/unit/ … Factory / Engine / NavLib / AccretiveIndex
test/mocks/MockERC20.sol MockSwapAdapter.sol
docs/{ARCHITECTURE,ACCOUNTING,SECURITY,GLOSSARY}.md
```

## Build & test

```bash
export PATH="$PATH:/home/box/.foundry/bin"
cd /workspace/omnibit
forge fmt
forge build
forge test -vvv
```

## Dependencies

- OpenZeppelin Contracts + Upgradeable (Clones, Initializable ERC20, AccessControl, ReentrancyGuard, SafeERC20, Math)
- forge-std

## License

MIT
