'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, maxUint256 } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, IndexZapRouterAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, fmtUnits, shortAddr } from '@/lib/format';

export default function MintPage() {
  const { address } = useAccount();
  const index = addresses.ai2;
  const zap = addresses.zap;
  const usdc = addresses.usdc;
  const [gross, setGross] = useState('0.01');
  const [usdcSpend, setUsdcSpend] = useState('1');
  const [mode, setMode] = useState<'inkind' | 'zap'>('zap');

  const grossShares = useMemo(() => {
    try {
      return parseUnits(gross || '0', 18);
    } catch {
      return 0n;
    }
  }, [gross]);

  const zapUsdc = useMemo(() => {
    try {
      return parseUnits(usdcSpend || '0', 6);
    } catch {
      return 0n;
    }
  }, [usdcSpend]);

  const { data: preview } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'previewMint',
    args: grossShares > 0n ? [grossShares] : undefined,
    query: { enabled: hasAddress(index) && grossShares > 0n },
  });

  const { data: constituents } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'constituents',
    query: { enabled: hasAddress(index) },
  });

  const required = preview?.[0] as bigint[] | undefined;
  const userShares = preview?.[1] as bigint | undefined;
  const feeShares = preview?.[2] as bigint | undefined;

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function approveToken(token: `0x${string}` | undefined) {
    if (!index || !token) return;
    reset();
    writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'approve',
      args: [index, maxUint256],
    });
  }

  function mintInKind() {
    if (!index || !address || grossShares === 0n) return;
    reset();
    writeContract({
      address: index,
      abi: AccretiveIndexAbi,
      functionName: 'mintExactShares',
      args: [grossShares, address],
    });
  }

  function approveUsdcZap() {
    if (!zap) return;
    reset();
    writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [zap, maxUint256],
    });
  }

  function buyBasket() {
    if (!zap || !constituents || constituents.length < 2 || zapUsdc === 0n) return;
    reset();
    const weights = constituents.map(() => 5000) as number[];
    const minOut = constituents.map(() => 0n);
    writeContract({
      address: zap,
      abi: IndexZapRouterAbi,
      functionName: 'buyTargetBasket',
      args: [constituents as `0x${string}`[], weights, zapUsdc, minOut, deadlineSeconds()],
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mint"
        subtitle="Zap spends USDC 50/50 into tNVDA and tMSFT. Then mint shares from the tokens in your wallet."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Zap: spend USDC',
            body: 'Buy 50/50 basket. Tokens land in your wallet. This does not mint shares.',
          },
          {
            title: 'Mint',
            body: 'Approve tNVDA and tMSFT, then mint a share amount the preview basket can cover.',
          },
        ]}
      />

      <Panel title="Mint shares">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={mode === 'inkind' ? btnPrimary : btnSecondary}
            onClick={() => setMode('inkind')}
          >
            Deposit basket (in-kind)
          </button>
          <button
            type="button"
            className={mode === 'zap' ? btnPrimary : btnSecondary}
            onClick={() => setMode('zap')}
          >
            Pay with USDC (buy 50/50)
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {mode === 'zap' && (
            <Field label="USDC to spend" help="Split 50/50 across tNVDA and tMSFT pools. Start with 1.">
              <input className={inputClass} value={usdcSpend} onChange={(e) => setUsdcSpend(e.target.value)} />
            </Field>
          )}
          <Field
            label="Shares to mint after you hold the basket"
            help="In-kind mint. Must be covered by tNVDA + tMSFT in this wallet."
          >
            <input className={inputClass} value={gross} onChange={(e) => setGross(e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="You receive (preview)" value={fmtUnits(userShares)} />
          <Stat label="Share fee" value={fmtUnits(feeShares)} hint="~10 bps" />
          <Stat label="Index" value={shortAddr(index)} />
        </div>

        {required && constituents && (
          <div className="mt-4 overflow-x-auto">
            <p className="mb-2 text-xs font-medium text-slate-500">Basket required for the share amount above</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Asset</th>
                  <th className="py-2">Amount needed</th>
                </tr>
              </thead>
              <tbody>
                {constituents.map((c, i) => (
                  <tr key={c} className="border-t border-canvas-border/60 font-mono text-xs">
                    <td className="py-2 pr-3">{shortAddr(c)}</td>
                    <td className="py-2">{fmtUnits(required[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mode === 'zap' ? (
          <TxGate require={['ai2', 'zap', 'usdc']} actionLabel="USDC basket buy">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdcZap}>
                Approve USDC for zap
              </button>
              <button type="button" className={btnPrimary} disabled={isPending} onClick={buyBasket}>
                Buy 50/50 basket
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              After the buy confirms: Approve tNVDA, Approve tMSFT, Mint shares (use 0.01 first).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveToken(addresses.tNVDA)}>
                Approve tNVDA
              </button>
              <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveToken(addresses.tMSFT)}>
                Approve tMSFT
              </button>
              <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={mintInKind}>
                Mint shares
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        ) : (
          <TxGate require={['ai2']} actionLabel="in-kind mint">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveToken(addresses.tNVDA)}>
                Approve tNVDA
              </button>
              <button type="button" className={btnSecondary} disabled={isPending} onClick={() => approveToken(addresses.tMSFT)}>
                Approve tMSFT
              </button>
              <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={mintInKind}>
                Mint shares
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        )}
      </Panel>
    </div>
  );
}
