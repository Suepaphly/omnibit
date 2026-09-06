# Accounting

All math is integer-only. Fees use basis points (`bps / 10_000`). Index shares use **18 decimals**. No floating point.

## Core identities

```
backing_per_share[i] = trackedBalance[i] / totalSupply          (when supply > 0)
raw[i]               = IERC20(constituent[i]).balanceOf(vault)
invariant            = trackedBalance[i] <= raw[i]   (after successful state changes)
```

Untracked donation:

```
donation[i] = raw[i] - trackedBalance[i]   (>= 0)
```

Donations do **not** affect mint/redeem until explicitly recognized (they never are, except via intentional `depositAccretion` / seed / mint pulls).

## Seed

```
tracked[i] := amounts[i]          // after pull from launcher
totalSupply := initialGrossShares // minted to lpReceiver
fee := 0
```

## Mint

Given `grossShares` and `supplyBefore = totalSupply`:

```
required[i] = ceil( tracked[i] * grossShares / supplyBefore )
feeShares   = floor( grossShares * mintFeeBps / 10_000 )
userShares  = grossShares - feeShares

tracked[i] += required[i]
totalSupply += grossShares          // userShares + feeShares
```

Ceil prevents diluting existing holders when required amounts round.

### Worked example (Index AI2 fixture)

Seed: `tracked = [2.5e18 tNVDA, 1.0e18 tMSFT]`, `supply = 1000e18`, `mintFeeBps = 10`.

Mint `grossShares = 100e18`:

```
required[tNVDA] = ceil(2.5e18 * 100e18 / 1000e18) = 0.25e18
required[tMSFT] = ceil(1.0e18 * 100e18 / 1000e18) = 0.10e18
feeShares       = floor(100e18 * 10 / 10_000)     = 0.1e18
userShares      = 99.9e18
```

## Redeem

```
feeShares    = floor( sharesIn * redeemFeeBps / 10_000 )
redeemShares = sharesIn - feeShares
assetOut[i]  = floor( tracked[i] * redeemShares / supplyBefore )

// transfer feeShares to treasury; burn redeemShares
tracked[i]  -= assetOut[i]
totalSupply -= redeemShares
```

Floor keeps the vault solvent (never owes more than tracked pro-rata).

### Small-int floor fixture

`tracked=1000`, `supply=3`, `sharesIn=2`, `redeemFeeBps=10` → fee=`0`, redeemShares=`2`:

```
assetOut = floor(1000 * 2 / 3) = 666
```

## Accretion

```
tracked[i]              += amounts[i]
cumulativeAccretedRaw[i] += amounts[i]
totalSupply unchanged
```

### Why backing rises with constant supply

Before accretion: `bps = T / S`. After depositing `A` with no mint: `bps' = (T+A)/S > bps` when `A > 0`.

Redeemers later receive floor-pro-rata of the **larger** tracked pile.

`cumulativeAccretedUsdWad` is reserved for oracle-priced USD accrual for UI; **this core never writes it**.

## Why share fees stay backed

Fee shares are minted (mint path) or transferred (redeem path) to `protocolTreasury` as the same ERC-20. They remain a claim on `tracked / totalSupply`, so treasury shares are backed exactly like any other holder’s shares (subject to floor redeem rounding).
