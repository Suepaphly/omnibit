'use client';

import { useMemo, useState } from 'react';
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { Panel, Field, inputClass, btnPrimary, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses, hasAddress } from '@/config/addresses';
import { IndexFeeHookAbi, AccretionEngineAbi, erc20Abi, AccretiveIndexAbi } from '@/abi';
import { deadlineSeconds, fmtUnits, shortAddr } from '@/lib/format';

export default function AccretionPage() {
  const hook = addresses.hook;
  const engine = addresses.engine;
  const usdc = addresses.usdc;
  const poolId = addresses.poolId;
  const index = addresses.ai2;
  const [minOut0, setMinOut0] = useState('0');
  const [minOut1, setMinOut1] = useState('0');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: pending } = useReadContract({
    address: hook,
    abi: IndexFeeHookAbi,
    functionName: 'pendingHookUsdc',
    args: poolId ? [poolId] : undefined,
    query: { enabled: hasAddress(hook) && Boolean(poolId) },
  });

  const { data: engineUsdc } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: engine ? [engine] : undefined,
    query: { enabled: hasAddress(usdc) && hasAddress(engine) },
  });

  const { data: weights } = useReadContract({
    address: engine,
    abi: AccretionEngineAbi,
    functionName: 'launchWeightsBps',
    query: { enabled: hasAddress(engine) },
  });

  const { data: usdWad } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'cumulativeAccretedUsdWad',
    query: { enabled: hasAddress(index) },
  });

  const { data: split } = useReadContract({
    address: hook,
    abi: IndexFeeHookAbi,
    functionName: 'splitFees',
    args: pending !== undefined ? [pending as bigint] : undefined,
    query: { enabled: hasAddress(hook) && pending !== undefined },
  });

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const minOut = useMemo(() => {
    const parse = (s: string) => {
      try {
        return BigInt(s || '0');
      } catch {
        return 0n;
      }
    };
    return [parse(minOut0), parse(minOut1)];
  }, [minOut0, minOut1]);

  function sweep() {
    if (!hook || !poolId) return;
    reset();
    writeContract({
      address: hook,
      abi: IndexFeeHookAbi,
      functionName: 'sweepFees',
      args: [poolId],
    });
  }

  function harvest() {
    if (!engine) return;
    reset();
    writeContract({
      address: engine,
      abi: AccretionEngineAbi,
      functionName: 'harvest',
      args: [minOut, deadlineSeconds()],
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accretion"
        subtitle="Move protocol trading fees into the vault so existing shares become more valuable — without minting new shares."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Check fees waiting to sweep',
            body: 'Protocol hook fees from trading accumulate as USDC. Sweep splits them between treasury and the accretion engine.',
          },
          {
            title: 'Sweep fees',
            body: 'Moves pending USDC out of the hook (50/50 treasury / engine; odd wei → engine).',
          },
          {
            title: 'Set minimum outputs (optional)',
            body: 'Slippage floors for each constituent when harvesting. Leave 0 for open (testnet).',
          },
          {
            title: 'Harvest into the basket',
            body: 'Engine buys constituents at launch weights and deposits them — zero new shares (non-dilutive).',
          },
        ]}
      />

      <Panel
        title="Grow the index"
        subtitle="Two steps: sweep protocol fees, then harvest them into basket assets."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Fees waiting to sweep"
            value={fmtUnits(pending as bigint | undefined, 6)}
            hint="USDC"
            help="pendingHookUsdc — protocol hook fee accrued for this PoolId."
          />
          <Stat label="Engine USDC balance" value={fmtUnits(engineUsdc, 6)} hint="Ready to harvest" />
          <Stat
            label="Sweep split preview"
            value={
              split
                ? `Treasury ${fmtUnits(split[0], 6)} / Engine ${fmtUnits(split[1], 6)}`
                : '—'
            }
            help="splitFees(pending): 50/50 treasury vs engine; odd wei goes to engine."
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Stat
              label="Accrued USD (display)"
              value={fmtUnits(usdWad as bigint | undefined, 18, 4)}
              help="cumulativeAccretedUsdWad — NAV display only."
            />
            <div className="rounded-xl border border-canvas-border/70 bg-canvas/60 px-3.5 py-3 text-xs text-slate-400">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Weights & contracts</div>
              <p className="mt-1 font-mono">
                Launch weights:{' '}
                {weights ? (weights as number[]).join(' / ') + ' bps' : '—'}
              </p>
              <p className="mt-1">
                Engine {shortAddr(engine)} · Hook {shortAddr(hook)}
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            label="Harvest min out — asset 0"
            help="Minimum raw wei of first constituent from harvest (slippage protection)."
          >
            <input className={inputClass} value={minOut0} onChange={(e) => setMinOut0(e.target.value)} />
          </Field>
          <Field
            label="Harvest min out — asset 1"
            help="Minimum raw wei of second constituent from harvest (slippage protection)."
          >
            <input className={inputClass} value={minOut1} onChange={(e) => setMinOut1(e.target.value)} />
          </Field>
        </div>

        <TxGate require={['hook', 'poolId']} actionLabel="sweep fees">
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={isPending} onClick={sweep}>
              Sweep fees
            </button>
          </div>
        </TxGate>

        <TxGate require={['engine']} actionLabel="harvest">
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={isPending} onClick={harvest}>
              Harvest into basket
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
