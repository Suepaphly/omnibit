'use client';

import { useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { Panel, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, erc20Abi, IndexFactoryAbi } from '@/abi';
import { fmtUnits, fmtUsdWad, shortAddr } from '@/lib/format';

const Q96 = 2n ** 96n;

function fmtInt(n?: bigint) {
  if (n === undefined) return '—';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function poolReserves(sqrt?: bigint, liq?: bigint) {
  if (!sqrt || !liq || sqrt === 0n) return { usdc: undefined as bigint | undefined, token: undefined as bigint | undefined };
  return {
    usdc: (liq * Q96) / sqrt,
    token: (liq * sqrt) / Q96,
  };
}

function usdPerToken1Wad(sqrtPriceX96?: bigint): bigint | undefined {
  if (!sqrtPriceX96 || sqrtPriceX96 === 0n) return undefined;
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;
  const token0RawForOneToken1 = (2n ** 192n * 10n ** 18n) / priceX192;
  return token0RawForOneToken1 * 10n ** 12n;
}

const feedAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'roundId', type: 'uint80' },
      { name: 'answer', type: 'int256' },
      { name: 'startedAt', type: 'uint256' },
      { name: 'updatedAt', type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80' },
    ],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const stateViewAbi = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    type: 'function',
    name: 'getLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const;

const FALLBACK_FEED: Record<string, `0x${string}`> = {
  '0xb2000000000000000000007199556a4a08e9a745': '0x597fAD4dA2eA41A65E1Fac60E5c5379D8393cE64',
  '0xb200000000000000000000d9428c971c80a277b6': '0x7cEB1Ea87c451D178e6fDEdB00405aB3Fc297d43',
};

const STOCK_POOLS: { label: string; poolId: `0x${string}`; token: `0x${string}`; hook: string }[] = [
  {
    label: 'tNVDA / USDC',
    poolId: '0x752aff8e829af9ddb28f810b752aa455199510b50c2ea26659a0bfb78d80881a',
    token: '0xB2000000000000000000007199556a4A08e9A745',
    hook: 'none',
  },
  {
    label: 'tMSFT / USDC',
    poolId: '0x6b09b1a9e55fe47f2aa338726a7ef0c7e75e455ad4a65e94ffe66178529c5d6f',
    token: '0xb200000000000000000000d9428C971c80a277B6',
    hook: 'none',
  },
];

export default function VaultPage() {
  const index = addresses.ai2;
  const enabled = hasAddress(index);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const stateView = addresses.stateView;

  const { data: meta } = useReadContracts({
    contracts: enabled
      ? [
          { address: index!, abi: AccretiveIndexAbi, functionName: 'name' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'symbol' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'totalSupply' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'cumulativeAccretedUsdWad' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'constituents' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'seeded' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'mintFeeBps' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'redeemFeeBps' },
          { address: index!, abi: AccretiveIndexAbi, functionName: 'accretionEngine' },
        ]
      : [],
    query: { enabled },
  });

  const name = meta?.[0]?.result as string | undefined;
  const symbol = meta?.[1]?.result as string | undefined;
  const totalSupply = meta?.[2]?.result as bigint | undefined;
  const usdWad = meta?.[3]?.result as bigint | undefined;
  const constituents = meta?.[4]?.result as `0x${string}`[] | undefined;
  const seeded = meta?.[5]?.result as boolean | undefined;
  const mintFee = meta?.[6]?.result as number | undefined;
  const redeemFee = meta?.[7]?.result as number | undefined;
  const engine = meta?.[8]?.result as `0x${string}` | undefined;

  const basketReads = useMemo(() => {
    if (!enabled || !constituents?.length) return [];
    const calls = [];
    for (const c of constituents) {
      calls.push({ address: index!, abi: AccretiveIndexAbi, functionName: 'trackedBalance' as const, args: [c] as const });
      calls.push({ address: c, abi: erc20Abi, functionName: 'balanceOf' as const, args: [index!] as const });
      calls.push({ address: c, abi: erc20Abi, functionName: 'symbol' as const });
      calls.push({ address: index!, abi: AccretiveIndexAbi, functionName: 'cumulativeAccretedRaw' as const, args: [c] as const });
    }
    return calls;
  }, [enabled, constituents, index]);

  const { data: basket } = useReadContracts({
    contracts: basketReads,
    query: { enabled: basketReads.length > 0 },
  });

  const factory = addresses.factory;
  const feedCalls = useMemo(() => {
    if (!factory || !constituents?.length) return [];
    return constituents.map((c) => ({
      address: factory,
      abi: IndexFactoryAbi,
      functionName: 'priceFeedOf' as const,
      args: [c] as const,
    }));
  }, [factory, constituents]);

  const { data: feeds } = useReadContracts({
    contracts: feedCalls,
    query: { enabled: feedCalls.length > 0 },
  });

  const rows = (constituents ?? []).map((c, i) => {
    const base = i * 4;
    const tracked = basket?.[base]?.result as bigint | undefined;
    const raw = basket?.[base + 1]?.result as bigint | undefined;
    const sym = (basket?.[base + 2]?.result as string | undefined) ?? shortAddr(c);
    const accrRaw = basket?.[base + 3]?.result as bigint | undefined;
    const donation =
      tracked !== undefined && raw !== undefined && raw >= tracked ? raw - tracked : undefined;
    const fromFactory = feeds?.[i]?.result as `0x${string}` | undefined;
    const feed = fromFactory ?? FALLBACK_FEED[c.toLowerCase()];
    return { c, sym, tracked, raw, accrRaw, donation, feed };
  });

  const priceCalls = useMemo(() => {
    const calls: { address: `0x${string}`; abi: typeof feedAbi; functionName: 'latestRoundData' | 'decimals' }[] = [];
    for (const r of rows) {
      if (!r.feed) continue;
      calls.push({ address: r.feed, abi: feedAbi, functionName: 'latestRoundData' });
      calls.push({ address: r.feed, abi: feedAbi, functionName: 'decimals' });
    }
    return calls;
  }, [rows]);

  const { data: prices } = useReadContracts({
    contracts: priceCalls,
    query: { enabled: priceCalls.length > 0 },
  });

  let basketUsdWad: bigint | undefined;
  const rowsPriced = rows.map((r, i) => {
    const answer = prices?.[i * 2]?.result as readonly [bigint, bigint, bigint, bigint, bigint] | undefined;
    const dec = prices?.[i * 2 + 1]?.result as number | undefined;
    const px = answer?.[1];
    let usdWadRow: bigint | undefined;
    if (r.tracked !== undefined && px !== undefined && px > 0n && dec !== undefined) {
      usdWadRow = (r.tracked * px) / 10n ** BigInt(dec);
      basketUsdWad = (basketUsdWad ?? 0n) + usdWadRow;
    }
    return { ...r, usdWadRow, px, dec };
  });

  const navPerShare =
    totalSupply && totalSupply > 0n && basketUsdWad !== undefined
      ? (basketUsdWad * 10n ** 18n) / totalSupply
      : undefined;

  const poolList = [
    ...STOCK_POOLS,
    ...(addresses.poolId
      ? [
          {
            label: 'AI2 / USDC',
            poolId: addresses.poolId,
            token: (addresses.ai2 ?? '0x8ae66f48Dd737F98FA2C5E8C5826aE497A8B9790') as `0x${string}`,
            hook: shortAddr(addresses.hook) ?? 'hook',
          },
        ]
      : []),
  ];

  const poolCalls = useMemo(() => {
    if (!stateView) return [];
    return poolList.flatMap((p) => [
      { address: stateView, abi: stateViewAbi, functionName: 'getSlot0' as const, args: [p.poolId] as const },
      { address: stateView, abi: stateViewAbi, functionName: 'getLiquidity' as const, args: [p.poolId] as const },
    ]);
  }, [stateView, addresses.poolId]);

  const { data: poolData } = useReadContracts({
    contracts: poolCalls,
    query: { enabled: poolCalls.length > 0 },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault"
        subtitle="Oracle NAV for the index. Pool mid is what zap/trade pay. Tick is Uniswap’s price index (1.0001^tick)."
      />

      <StepsGuide
        title="How to read this"
        defaultOpen={false}
        steps={[
          {
            title: 'Vault NAV',
            body: 'Est. value / share = tracked holdings × mock feeds / supply. Staying near $1 is expected.',
          },
          {
            title: 'Pool USDC / token',
            body: 'Approximate reserves from liquidity L and current price. Not the same as your wallet.',
          },
          {
            title: 'Tick',
            body: 'Discrete AMM price. You do not set it. Higher tick ≈ cheaper token vs USDC.',
          },
        ]}
      />

      <Panel title="Index summary" subtitle="Oracle mark-to-market, not pool mid.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Index" value={name && symbol ? `${name} (${symbol})` : shortAddr(index)} />
          <Stat label="Shares outstanding" value={fmtUnits(totalSupply, 18)} hint="totalSupply · 18 decimals" />
          <Stat
            label="Est. value / share"
            value={fmtUsdWad(navPerShare, 6)}
            hint="feeds × tracked / supply"
          />
          <Stat label="Seeded" value={seeded === undefined ? '—' : seeded ? 'Yes' : 'No'} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Basket USD (tracked)" value={fmtUsdWad(basketUsdWad, 4)} />
          <Stat label="Accreted USD (wad)" value={fmtUsdWad(usdWad)} />
        </div>
        <button type="button" className="mt-4 text-sm text-sky-400 underline" onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Hide advanced details' : 'Show advanced details'}
        </button>
        {showAdvanced && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Mint fee" value={mintFee !== undefined ? `${mintFee} bps` : '—'} />
            <Stat label="Redeem fee" value={redeemFee !== undefined ? `${redeemFee} bps` : '—'} />
            <Stat label="Accretion engine" value={shortAddr(engine ?? addresses.engine)} />
          </div>
        )}
      </Panel>

      <Panel
        title="Uniswap V4 pools"
        subtitle="USDC and Token reserves held in the Liquidity Pools"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Pool</th>
                <th className="py-2 pr-3">USDC in pool</th>
                <th className="py-2 pr-3">Token in pool</th>
                <th className="py-2 pr-3">Implied USD</th>
                <th className="py-2 pr-3">Feed USD</th>
                <th className="py-2 pr-3">Liquidity (L)</th>
                <th className="py-2">Tick</th>
              </tr>
            </thead>
            <tbody>
              {poolList.map((p, i) => {
                const slot = poolData?.[i * 2]?.result as readonly [bigint, number, number, number] | undefined;
                const liq = poolData?.[i * 2 + 1]?.result as bigint | undefined;
                const sqrt = slot?.[0];
                const tick = slot?.[1];
                const implied = usdPerToken1Wad(sqrt);
                const { usdc, token } = poolReserves(sqrt, liq);
                const row = rowsPriced.find((r) => r.c.toLowerCase() === p.token.toLowerCase());
                const feedUsd =
                  row?.px !== undefined && row.dec !== undefined
                    ? (row.px * 10n ** 18n) / 10n ** BigInt(row.dec)
                    : p.label.startsWith('AI2')
                      ? navPerShare
                      : undefined;
                return (
                  <tr key={p.poolId} className="border-t border-canvas-border/60 font-mono text-xs">
                    <td className="py-2 pr-3 text-slate-200">
                      {p.label}
                      <div className="text-[10px] text-slate-500">hook {p.hook}</div>
                    </td>
                    <td className="py-2 pr-3">{fmtUnits(usdc, 6, 2)}</td>
                    <td className="py-2 pr-3">{fmtUnits(token, 18, 6)}</td>
                    <td className="py-2 pr-3">{fmtUsdWad(implied, 4)}</td>
                    <td className="py-2 pr-3">{fmtUsdWad(feedUsd, 4)}</td>
                    <td className="py-2 pr-3" title="Uniswap L, not USD">
                      {fmtInt(liq)}
                    </td>
                    <td className="py-2" title="1.0001^tick. Higher tick = cheaper token vs USDC.">
                      {tick === undefined ? '—' : String(tick)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Basket holdings" subtitle="Recognized vs on-chain balances.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Asset</th>
                <th className="py-2 pr-3">Recognized</th>
                <th className="py-2 pr-3">On-chain</th>
                <th className="py-2 pr-3">Donation</th>
                <th className="py-2 pr-3">USD (tracked)</th>
                <th className="py-2">Price feed</th>
              </tr>
            </thead>
            <tbody>
              {rowsPriced.map((r) => (
                <tr key={r.c} className="border-t border-canvas-border/60 font-mono text-xs">
                  <td className="py-2 pr-3 text-slate-200">
                    {r.sym}
                    <div className="text-[10px] text-slate-500">{shortAddr(r.c)}</div>
                  </td>
                  <td className="py-2 pr-3">{fmtUnits(r.tracked)}</td>
                  <td className="py-2 pr-3">{fmtUnits(r.raw)}</td>
                  <td className="py-2 pr-3 text-slate-400">{fmtUnits(r.donation)}</td>
                  <td className="py-2 pr-3">{fmtUsdWad(r.usdWadRow)}</td>
                  <td className="py-2">{shortAddr(r.feed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}