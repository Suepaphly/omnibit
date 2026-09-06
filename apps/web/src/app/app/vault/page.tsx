'use client';

import { useMemo } from 'react';
import { useReadContract, useReadContracts } from 'wagmi';
import { Panel, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, erc20Abi, IndexFactoryAbi } from '@/abi';
import { fmtUnits, fmtUsdWad, shortAddr } from '@/lib/format';

export default function VaultPage() {
  const index = addresses.ai2;
  const enabled = hasAddress(index);

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

  // NAV per share ≈ (basket USD via feeds) / supply — display only
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

  // Simple navPerShare from accretion display: if supply>0, show 1e18 + usdWad/supply as rough uplift heuristic,
  // plus note that full NAV uses feeds.
  const navPerShare =
    totalSupply && totalSupply > 0n && usdWad !== undefined
      ? 10n ** 18n + (usdWad * 10n ** 18n) / totalSupply
      : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vault"
        subtitle="Tracked vs raw balances, supply, and accretion display. Donations stay untracked; UsdWad is NAV display only."
      />
      <Panel
        title="Vault"
        subtitle="Recognized trackedBalance vs raw ERC-20 balances. Donations are untracked. cumulativeAccretedUsdWad is display/NAV only — never redeem rights."
      >
        {!enabled && (
          <p className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-100">
            Set <code className="font-mono text-xs">NEXT_PUBLIC_AI2_INDEX</code> to load vault state.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Index" value={name && symbol ? `${name} (${symbol})` : shortAddr(index)} />
          <Stat label="totalSupply" value={fmtUnits(totalSupply, 18)} hint="18 decimals" />
          <Stat
            label="navPerShare (display)"
            value={fmtUsdWad(navPerShare)}
            hint="~$1 seed + UsdWad/supply heuristic"
          />
          <Stat label="cumulativeAccretedUsdWad" value={fmtUsdWad(usdWad)} />
          <Stat label="seeded" value={seeded === undefined ? '—' : String(seeded)} />
          <Stat label="mintFeeBps" value={mintFee?.toString() ?? '—'} />
          <Stat label="redeemFeeBps" value={redeemFee?.toString() ?? '—'} />
          <Stat label="engine" value={shortAddr(engine ?? addresses.engine)} />
        </div>
      </Panel>

      <Panel title="Constituents — tracked vs raw" subtitle="invariant: tracked ≤ raw after successful state changes">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-3">Asset</th>
                <th className="py-2 pr-3">Tracked</th>
                <th className="py-2 pr-3">Raw</th>
                <th className="py-2 pr-3">Donation</th>
                <th className="py-2 pr-3">Accreted raw</th>
                <th className="py-2">Feed</th>
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
      </Panel>
    </div>
  );
}
