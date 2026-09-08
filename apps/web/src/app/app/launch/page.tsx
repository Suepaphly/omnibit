'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseUnits, parseEventLogs, type Address } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses } from '@/config/addresses';
import { IndexLauncherAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, shortAddr } from '@/lib/format';

export default function LaunchPage() {
  const { address } = useAccount();
  const [name, setName] = useState('Index AI2');
  const [symbol, setSymbol] = useState('AI2');
  const [backingUsdc, setBackingUsdc] = useState('2');
  const [lpUsdc, setLpUsdc] = useState('1');
  const [indexOverride, setIndexOverride] = useState(addresses.ai2 ?? '');
  const [showAddrs, setShowAddrs] = useState(false);

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
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!receipt) return;
    try {
      const evs = parseEventLogs({
        abi: IndexLauncherAbi,
        logs: receipt.logs,
        eventName: 'IndexSeeded',
      });
      const created = evs[0]?.args?.index as Address | undefined;
      if (created) setIndexOverride(created);
    } catch {
      /* not a createSeed receipt */
    }
  }, [receipt]);

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
      constituents: [tNVDA, tMSFT] as Address[],
      initialWeightsBps: [5000, 5000],
      creator: address,
    };
  }, [name, symbol, tNVDA, tMSFT, address]);

  function approveUsdc() {
    if (!launcher) return;
    reset();
    writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, backing + lp],
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
          constituents: indexParams.constituents,
          initialWeightsBps: indexParams.initialWeightsBps,
          creator: indexParams.creator,
        },
        backing,
        backing,
        [0n, 0n],
        deadlineSeconds(),
      ],
    });
  }

  function approveShares() {
    if (!launcher || !indexForMarket) return;
    reset();
    const indexAmount = lp * 10n ** 12n;
    writeContract({
      address: indexForMarket,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, indexAmount],
    });
  }

  function openMarket() {
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
        subtitle="1b buys the basket and deploys the index. 2b opens the AI2/USDC pool and seeds LP."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: '1a Approve USDC',
            body: 'Launcher can pull seed + LP USDC.',
          },
          {
            title: '1b Create Index and Seed',
            body: 'Deploys the index token and buys tNVDA + tMSFT. The new index address fills in below from the receipt.',
          },
          {
            title: '2a Approve shares for LP',
            body: 'Allow the launcher to pair those index shares with USDC.',
          },
          {
            title: '2b Open market',
            body: 'Creates the Uniswap V4 index/USDC pool with the fee hook and adds liquidity.',
          },
        ]}
      />

      <Panel title="Bootstrap an index" subtitle="Use 2 USDC seed and 1 USDC LP on Sepolia.">
        <button
          type="button"
          className="mb-4 text-xs font-medium text-accent-soft underline-offset-2 hover:underline"
          onClick={() => setShowAddrs((v) => !v)}
        >
          {showAddrs ? 'Hide contract addresses' : 'Show contract addresses'}
        </button>
        {showAddrs && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Launcher" value={shortAddr(launcher)} />
            <Stat label="tNVDA" value={shortAddr(tNVDA)} />
            <Stat label="tMSFT" value={shortAddr(tMSFT)} />
          </div>
        )}

        <TxGate require={['launcher', 'tNVDA', 'tMSFT', 'usdc']} actionLabel="launch">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Index name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Symbol">
              <input className={inputClass} value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            </Field>
            <Field label="USDC for basket seed" help="Spent in 1b to buy tNVDA and tMSFT.">
              <input className={inputClass} value={backingUsdc} onChange={(e) => setBackingUsdc(e.target.value)} />
            </Field>
            <Field label="USDC for pool liquidity" help="Paired with index shares in 2b.">
              <input className={inputClass} value={lpUsdc} onChange={(e) => setLpUsdc(e.target.value)} />
            </Field>
            <Field
              label="Index address"
              help="Filled from 1b (IndexSeeded). Defaults to the live AI2 index."
            >
              <input
                className={inputClass}
                value={indexOverride}
                onChange={(e) => setIndexOverride(e.target.value)}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <p className="text-xs text-slate-500">
                USDC approved for launcher:{' '}
                <span className="font-mono">{allowance?.toString() ?? '—'}</span>
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdc}>
              1a Approve USDC
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={createSeed}>
              1b Create Index and Seed
            </button>
            <button type="button" className={btnSecondary} disabled={isPending || !indexForMarket} onClick={approveShares}>
              2a Approve shares for LP
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !indexForMarket} onClick={openMarket}>
              2b Open market
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
