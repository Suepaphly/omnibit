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
        // constituent 18 dec mins
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
        subtitle="Sweep pending hook USDC, then harvest into constituents at launch weights — zero new shares."
      />
      <Panel
        title="Accretion loop"
        subtitle="sweepFees splits pendingHookUsdc 50/50 treasury/engine (odd wei → engine). harvest buys at launch weights, worst-leg depositAccretion (zero new shares)."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="pendingHookUsdc" value={fmtUnits(pending as bigint | undefined, 6)} hint="6 dec" />
          <Stat label="engine USDC" value={fmtUnits(engineUsdc, 6)} />
          <Stat
            label="sweep split"
            value={
              split
                ? `T ${fmtUnits(split[0], 6)} / E ${fmtUnits(split[1], 6)}`
                : '—'
            }
          />
          <Stat label="cumulativeAccretedUsdWad" value={fmtUnits(usdWad as bigint | undefined, 18, 4)} />
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Launch weights:{' '}
          <span className="font-mono">
            {weights ? (weights as number[]).join(' / ') + ' bps' : '—'}
          </span>
          {' · '}
          Engine {shortAddr(engine)} · Hook {shortAddr(hook)}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="harvest minOut[0] (raw wei)">
            <input className={inputClass} value={minOut0} onChange={(e) => setMinOut0(e.target.value)} />
          </Field>
          <Field label="harvest minOut[1] (raw wei)">
            <input className={inputClass} value={minOut1} onChange={(e) => setMinOut1(e.target.value)} />
          </Field>
        </div>

        <TxGate require={['hook', 'poolId']} actionLabel="sweepFees">
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={isPending} onClick={sweep}>
              sweepFees
            </button>
          </div>
        </TxGate>

        <TxGate require={['engine']} actionLabel="harvest">
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={isPending} onClick={harvest}>
              harvest
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
