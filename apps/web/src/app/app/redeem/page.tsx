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
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
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
      <PageHeader
        title="Redeem"
        subtitle="Burn index shares and receive your pro-rata slice of the basket — no oracle or DEX required."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Connect on Base Sepolia',
            body: 'Your wallet must hold AI2 shares on Base Sepolia.',
          },
          {
            title: 'Enter shares to redeem',
            body: 'Preview shows the share fee and how much of each basket asset you’ll receive (floor).',
          },
          {
            title: 'Confirm redeem',
            body: 'Burns shares after the fee and sends floor pro-rata constituents to your wallet.',
          },
        ]}
      />

      <Panel
        title="Redeem for basket assets"
        subtitle="Primary solvency path: small share fee, burn, then floor pro-rata basket. In-kind only."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Your AI2 balance" value={fmtUnits(bal as bigint | undefined)} />
          <Stat
            label="Shares burned"
            value={fmtUnits(redeemShares)}
            help="redeemShares from previewRedeem — amount burned after fee."
          />
          <Stat
            label="Share fee"
            value={fmtUnits(feeShares)}
            hint="~10 bps"
            help="feeShares — typically 10 basis points to treasury."
          />
        </div>

        <div className="mt-4">
          <Field label="Shares to redeem" help="Gross shares in (18 decimals) passed to redeem().">
            <input className={inputClass} value={shares} onChange={(e) => setShares(e.target.value)} />
          </Field>
        </div>

        {assetOut && constituents && (
          <div className="mt-4 overflow-x-auto">
            <p className="mb-2 text-xs font-medium text-slate-500">You receive (floor)</p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Asset</th>
                  <th className="py-2">Amount out</th>
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
              Redeem shares
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
