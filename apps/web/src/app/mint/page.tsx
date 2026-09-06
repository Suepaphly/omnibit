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
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, IndexZapRouterAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, fmtUnits, shortAddr } from '@/lib/format';

export default function MintPage() {
  const { address } = useAccount();
  const index = addresses.ai2;
  const zap = addresses.zap;
  const usdc = addresses.usdc;
  const [gross, setGross] = useState('10');
  const [maxUsdc, setMaxUsdc] = useState('50');
  const [mode, setMode] = useState<'inkind' | 'zap'>('inkind');

  const grossShares = useMemo(() => {
    try {
      return parseUnits(gross || '0', 18);
    } catch {
      return 0n;
    }
  }, [gross]);
  const maxUSDC = useMemo(() => {
    try {
      return parseUnits(maxUsdc || '0', 6);
    } catch {
      return 0n;
    }
  }, [maxUsdc]);

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

  function approveConstituents() {
    if (!index || !constituents || !required) return;
    reset();
    // approve first constituent that needs allowance — user may click per asset
    for (let i = 0; i < constituents.length; i++) {
      if ((required[i] ?? 0n) > 0n) {
        writeContract({
          address: constituents[i],
          abi: erc20Abi,
          functionName: 'approve',
          args: [index, required[i]!],
        });
        break;
      }
    }
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

  function mintZap() {
    if (!zap || !index || grossShares === 0n) return;
    reset();
    writeContract({
      address: zap,
      abi: IndexZapRouterAbi,
      functionName: 'mintExactSharesWithUSDC',
      args: [index, grossShares, maxUSDC, deadlineSeconds()],
    });
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Mint"
        subtitle="In-kind mintExactShares pulls ceil pro-rata basket. Zap path buys constituents with USDC then mints. 10 bps share fee to treasury."
      >
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={mode === 'inkind' ? btnPrimary : btnSecondary}
            onClick={() => setMode('inkind')}
          >
            In-kind
          </button>
          <button
            type="button"
            className={mode === 'zap' ? btnPrimary : btnSecondary}
            onClick={() => setMode('zap')}
          >
            Zap USDC
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Gross shares (18 dec)">
            <input className={inputClass} value={gross} onChange={(e) => setGross(e.target.value)} />
          </Field>
          {mode === 'zap' && (
            <Field label="Max USDC">
              <input className={inputClass} value={maxUsdc} onChange={(e) => setMaxUsdc(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat label="preview userShares" value={fmtUnits(userShares)} />
          <Stat label="preview feeShares" value={fmtUnits(feeShares)} hint="10 bps" />
          <Stat label="index" value={shortAddr(index)} />
        </div>

        {required && constituents && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Constituent</th>
                  <th className="py-2">Required (ceil)</th>
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

        {mode === 'inkind' ? (
          <TxGate require={['ai2']} actionLabel="in-kind mint">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={approveConstituents}>
                Approve next constituent
              </button>
              <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={mintInKind}>
                mintExactShares
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        ) : (
          <TxGate require={['ai2', 'zap', 'usdc']} actionLabel="USDC zap mint">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdcZap}>
                Approve USDC → Zap
              </button>
              <button type="button" className={btnPrimary} disabled={isPending} onClick={mintZap}>
                mintExactSharesWithUSDC
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        )}
      </Panel>
    </div>
  );
}
