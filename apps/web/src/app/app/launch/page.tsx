'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseUnits, type Address } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { addresses } from '@/config/addresses';
import { IndexLauncherAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, shortAddr } from '@/lib/format';

export default function LaunchPage() {
  const { address } = useAccount();
  const [name, setName] = useState('Index AI2');
  const [symbol, setSymbol] = useState('AI2');
  const [backingUsdc, setBackingUsdc] = useState('1000');
  const [lpUsdc, setLpUsdc] = useState('50');
  const [indexOverride, setIndexOverride] = useState('');

  const tNVDA = addresses.tNVDA;
  const tMSFT = addresses.tMSFT;
  const launcher = addresses.launcher;
  const usdc = addresses.usdc;

  const { data: allowance } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && launcher ? [address, launcher] : undefined,
    query: { enabled: Boolean(address && launcher) },
  });

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const indexForMarket = (indexOverride || addresses.ai2 || '') as Address;
  const backing = useMemo(() => {
    try {
      return parseUnits(backingUsdc || '0', 6);
    } catch {
      return 0n;
    }
  }, [backingUsdc]);
  const lp = useMemo(() => {
    try {
      return parseUnits(lpUsdc || '0', 6);
    } catch {
      return 0n;
    }
  }, [lpUsdc]);

  const indexParams = useMemo(() => {
    if (!tNVDA || !tMSFT || !address) return undefined;
    return {
      name,
      symbol,
      constituents: [tNVDA, tMSFT] as readonly [Address, Address],
      initialWeightsBps: [5000, 5000] as const,
      creator: address,
    };
  }, [name, symbol, tNVDA, tMSFT, address]);

  function approveUsdc(amount: bigint) {
    if (!launcher) return;
    reset();
    writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, amount],
    });
  }

  function createSeed() {
    if (!launcher || !indexParams) return;
    reset();
    writeContract({
      address: launcher,
      abi: IndexLauncherAbi,
      functionName: 'createSeed',
      args: [
        {
          name: indexParams.name,
          symbol: indexParams.symbol,
          constituents: [...indexParams.constituents],
          initialWeightsBps: [...indexParams.initialWeightsBps],
          creator: indexParams.creator,
        },
        backing,
        backing,
        deadlineSeconds(),
      ],
    });
  }

  function initializeMarket() {
    if (!launcher || !indexForMarket) return;
    reset();
    // INDEX amount ≈ lpUSDC * 1e12 at $1 NAV
    const indexAmount = lp * 10n ** 12n;
    writeContract({
      address: addresses.ai2 && indexForMarket === addresses.ai2 ? addresses.ai2 : indexForMarket,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, indexAmount],
    });
  }

  function initializeMarketTx() {
    if (!launcher || !indexForMarket) return;
    reset();
    writeContract({
      address: launcher,
      abi: IndexLauncherAbi,
      functionName: 'initializeMarket',
      args: [indexForMarket, lp, lp, deadlineSeconds()],
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        subtitle="Two-transaction bootstrap: createSeed then initializeMarket — factory index, basket seed, hook register, V4 pool + LP."
      />
      <Panel
        title="Launch (two-tx)"
        subtitle="Tx1 createSeed → factory.createIndex + basket buy + fee-free seed @ ~$1 NAV. Tx2 initializeMarket → hook register + V4 pool + full-range LP."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label="Launcher" value={shortAddr(launcher)} />
          <Stat label="tNVDA" value={shortAddr(tNVDA)} />
          <Stat label="tMSFT" value={shortAddr(tMSFT)} />
        </div>

        <TxGate require={['launcher', 'tNVDA', 'tMSFT', 'usdc']} actionLabel="launch">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Symbol">
              <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </Field>
            <Field label="Backing USDC (tx1)">
              <input className={inputClass} value={backingUsdc} onChange={(e) => setBackingUsdc(e.target.value)} />
            </Field>
            <Field label="LP USDC (tx2)">
              <input className={inputClass} value={lpUsdc} onChange={(e) => setLpUsdc(e.target.value)} />
            </Field>
            <Field label="Index address (tx2 — paste from createSeed receipt)">
              <input
                className={inputClass}
                placeholder={addresses.ai2 ?? '0x…'}
                value={indexOverride}
                onChange={(e) => setIndexOverride(e.target.value)}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <p className="text-xs text-slate-500">
                USDC allowance to launcher:{' '}
                <span className="font-mono">{allowance?.toString() ?? '—'}</span>
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveUsdc(backing > lp ? backing : lp)}>
              Approve USDC
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={createSeed}>
              1 · createSeed
            </button>
            <button type="button" className={btnSecondary} disabled={isPending || !indexForMarket} onClick={initializeMarket}>
              2a · Approve AI2 for LP
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !indexForMarket} onClick={initializeMarketTx}>
              2b · initializeMarket
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
