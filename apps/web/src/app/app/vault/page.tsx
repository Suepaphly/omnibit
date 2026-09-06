'use client';

import { useMemo, useState } from 'react';
import { useReadContracts } from 'wagmi';
import { Panel, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, erc20Abi, IndexFactoryAbi } from '@/abi';
import { fmtUnits, fmtUsdWad, shortAddr } from '@/lib/format';

export default function VaultPage() {
  const index = addresses.ai2;
  const enabled = hasAddress(index);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    return { c, sym, tracked, raw, accrRaw, donation, feed: feeds?.[i]?.result as `0x${string}` | undefined };
  });

  const navPerShare =
    totalSupply && totalSupply > 0n && usdWad !== undefined
      ? 10n ** 18n + (usdWad * 10n ** 18n) / totalSupply
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault"
        subtitle="Read-only view of the index: share supply, estimated value per share, and what’s in the basket."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Set the index address',
            body: 'Requires NEXT_PUBLIC_AI2_INDEX after launch (or deploy). Until then you’ll see an empty state.',
          },
          {
            title: 'Scan the summary cards',
            body: 'Supply, seeded flag, and estimated value per share are the main health checks.',
          },
          {
            title: 'Inspect the basket table',
            body: 'Each asset shows recognized holdings vs on-chain balance. Extra “donation” tokens stay untracked.',
          },
          {
            title: 'Open advanced details if needed',
            body: 'Fees in basis points, engine address, and UsdWad live under “Advanced”.',
          },
        ]}
      />

      <Panel
        title="Index summary"
        subtitle="High-level vault health. Technical fields are behind tooltips or Advanced."
      >
        {!enabled && (
          <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-100">
            No index address yet. Launch an index or set{' '}
            <code className="font-mono text-xs">NEXT_PUBLIC_AI2_INDEX</code> and redeploy.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Index" value={name && symbol ? `${name} (${symbol})` : shortAddr(index)} />
          <Stat label="Shares outstanding" value={fmtUnits(totalSupply, 18)} hint="totalSupply · 18 decimals" />
          <Stat
            label="Est. value / share"
            value={fmtUsdWad(navPerShare)}
            hint="Display heuristic"
            help="Rough navPerShare: ~$1 seed plus cumulativeAccretedUsdWad / supply. Full NAV uses price feeds."
          />
          <Stat
            label="Seeded"
            value={seeded === undefined ? '—' : seeded ? 'Yes' : 'No'}
            help="True after createSeed has funded the initial basket."
          />
        </div>

        <button
          type="button"
          className="mt-4 text-xs font-medium text-accent-soft underline-offset-2 hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? 'Hide advanced' : 'Show advanced details'}
        </button>
        {showAdvanced && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Accrued USD (display)"
              value={fmtUsdWad(usdWad)}
              help="cumulativeAccretedUsdWad — NAV display only; never redeem rights."
            />
            <Stat
              label="Mint fee"
              value={mintFee !== undefined ? `${mintFee} bps` : '—'}
              help="bps = basis points. 10 bps = 0.10%."
            />
            <Stat
              label="Redeem fee"
              value={redeemFee !== undefined ? `${redeemFee} bps` : '—'}
              help="bps = basis points. 10 bps = 0.10%."
            />
            <Stat label="Accretion engine" value={shortAddr(engine ?? addresses.engine)} />
          </div>
        )}
      </Panel>

      <Panel
        title="Basket holdings"
        subtitle="Recognized vs on-chain balances. Donations (raw − tracked) do not increase redeemable claims."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Asset</th>
                <th className="py-2 pr-3">
                  Recognized
                  <span className="ml-1 font-normal normal-case tracking-normal text-slate-600">(tracked)</span>
                </th>
                <th className="py-2 pr-3">
                  On-chain
                  <span className="ml-1 font-normal normal-case tracking-normal text-slate-600">(raw)</span>
                </th>
                <th className="py-2 pr-3">Donation</th>
                <th className="py-2 pr-3">Accrued raw</th>
                <th className="py-2">Price feed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-500">
                    No constituents loaded.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.c} className="border-t border-canvas-border/60 font-mono text-xs">
                  <td className="py-2 pr-3 text-slate-200">
                    {r.sym}
                    <div className="text-[10px] text-slate-500">{shortAddr(r.c)}</div>
                  </td>
                  <td className="py-2 pr-3">{fmtUnits(r.tracked)}</td>
                  <td className="py-2 pr-3">{fmtUnits(r.raw)}</td>
                  <td className="py-2 pr-3 text-slate-400">{fmtUnits(r.donation)}</td>
                  <td className="py-2 pr-3">{fmtUnits(r.accrRaw)}</td>
                  <td className="py-2">{shortAddr(r.feed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Invariant: recognized (tracked) ≤ on-chain (raw) after successful state changes.
        </p>
      </Panel>
    </div>
  );
}
