'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits } from 'viem';
import { Panel, Field, inputClass, btnPrimary, Stat } from '@/components/Panel';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi } from '@/abi';
import { fmtUnits, shortAddr } from '@/lib/format';

export default function RedeemPage() {
  const { address } = useAccount();
  const index = addresses.ai2;
  const [shares, setShares] = useState('10');

  const sharesIn = useMemo(() => {
    try {
      return parseUnits(shares || '0', 18);
    } catch {
      return 0n;
    }
  }, [shares]);

  const { data: preview } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'previewRedeem',
    args: sharesIn > 0n ? [sharesIn] : undefined,
    query: { enabled: hasAddress(index) && sharesIn > 0n },
  });

  const { data: constituents } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'constituents',
    query: { enabled: hasAddress(index) },
  });

  const { data: bal } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: hasAddress(index) && Boolean(address) },
  });

  const assetOut = preview?.[0] as bigint[] | undefined;
  const redeemShares = preview?.[1] as bigint | undefined;
  const feeShares = preview?.[2] as bigint | undefined;

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function redeem() {
    if (!index || !address || sharesIn === 0n) return;
    reset();
    writeContract({
      address: index,
      abi: AccretiveIndexAbi,
      functionName: 'redeem',
      args: [sharesIn, address],
    });
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Redeem (in-kind)"
        subtitle="Primary solvency path: share fee to treasury, burn redeemShares, floor pro-rata constituents. No oracle/DEX."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Your AI2 balance" value={fmtUnits(bal as bigint | undefined)} />
          <Stat label="preview redeemShares" value={fmtUnits(redeemShares)} />
          <Stat label="preview feeShares" value={fmtUnits(feeShares)} hint="10 bps" />
        </div>

        <div className="mt-4">
          <Field label="Shares in (18 dec)">
            <input className={inputClass} value={shares} onChange={(e) => setShares(e.target.value)} />
          </Field>
        </div>

        {assetOut && constituents && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Constituent</th>
                  <th className="py-2">assetOut (floor)</th>
                </tr>
              </thead>
              <tbody>
                {constituents.map((c, i) => (
                  <tr key={c} className="border-t border-canvas-border/60 font-mono text-xs">
                    <td className="py-2 pr-3">{shortAddr(c)}</td>
                    <td className="py-2">{fmtUnits(assetOut[i])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <TxGate require={['ai2']} actionLabel="redeem">
          <div className="mt-5">
            <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={redeem}>
              redeem
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
