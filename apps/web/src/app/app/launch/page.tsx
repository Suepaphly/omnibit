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
import { StepsGuide } from '@/components/StepsGuide';
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
        subtitle="Create a new index, seed its basket with USDC, then open the trading pool — two transactions on Base Sepolia."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Connect on Base Sepolia',
            body: 'Header wallet must be on Base Sepolia (84532).',
          },
          {
            title: 'Approve USDC for the launcher',
            body: 'Allow the launcher to spend enough USDC for seed backing and pool liquidity.',
          },
          {
            title: 'Create & seed (transaction 1)',
            body: 'Deploys the index and buys the initial basket near $1 per share.',
          },
          {
            title: 'Paste the new index address',
            body: 'Copy the index address from the create receipt (or set NEXT_PUBLIC_AI2_INDEX), then approve shares for LP.',
          },
          {
            title: 'Open the market (transaction 2)',
            body: 'Registers the fee hook and adds full-range liquidity on the Uniswap V4 pool.',
          },
        ]}
      />

      <Panel
        title="Bootstrap an index"
        subtitle="Step through the buttons below. Technical function names are in the tooltips."
      >
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
            <Stat label="tNVDA" value={shortAddr(tNVDA)} help="Test NVDA constituent token on Sepolia." />
            <Stat label="tMSFT" value={shortAddr(tMSFT)} help="Test MSFT constituent token on Sepolia." />
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
            <Field
              label="USDC for basket seed"
              help="createSeed: USDC spent to buy the initial constituent basket (6 decimals)."
            >
              <input className={inputClass} value={backingUsdc} onChange={(e) => setBackingUsdc(e.target.value)} />
            </Field>
            <Field
              label="USDC for pool liquidity"
              help="initializeMarket: USDC paired with index shares as full-range LP on V4."
            >
              <input className={inputClass} value={lpUsdc} onChange={(e) => setLpUsdc(e.target.value)} />
            </Field>
            <Field
              label="Index address (after create)"
              help="Paste from the createSeed receipt, or leave blank to use NEXT_PUBLIC_AI2_INDEX."
            >
              <input
                className={inputClass}
                placeholder={addresses.ai2 ?? '0x…'}
                value={indexOverride}
                onChange={(e) => setIndexOverride(e.target.value)}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2">
              <p className="text-xs text-slate-500">
                USDC already approved for launcher:{' '}
                <span className="font-mono">{allowance?.toString() ?? '—'}</span>
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveUsdc(backing > lp ? backing : lp)}>
              Approve USDC
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={createSeed}>
              1 · Create & seed
            </button>
            <button type="button" className={btnSecondary} disabled={isPending || !indexForMarket} onClick={initializeMarket}>
              2a · Approve shares for LP
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !indexForMarket} onClick={initializeMarketTx}>
              2b · Open market
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
