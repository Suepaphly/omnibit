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

  const grossSharesInKind = useMemo(() => {
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

  // $1 NAV: 1 USDC (6 dp) → 1 share (18 dp)
  const zapShares = zapUsdc * 10n ** 12n;
  const grossShares = mode === 'zap' ? zapShares : grossSharesInKind;

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
    if (!zap || !index || zapUsdc === 0n || zapShares === 0n) return;
    reset();
    writeContract({
      address: zap,
      abi: IndexZapRouterAbi,
      functionName: 'mintExactSharesWithUSDC',
      args: [index, zapShares, zapUsdc, deadlineSeconds()],
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mint"
        subtitle="Deposit basket assets — or pay with USDC — to receive index shares. Preview amounts before you send."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: 'Choose a path',
            body: 'Zap: type USDC to spend. In-kind: type shares and deposit tNVDA + tMSFT you already hold.',
          },
          {
            title: 'Preview',
            body: 'Zap assumes $1 NAV so 1 USDC ≈ 1 share before fees and pool slippage. Extra basket dust is refunded.',
          },
          {
            title: 'Approve spending',
            body: 'In-kind: approve each required constituent. Zap: approve USDC for the zap router.',
          },
          {
            title: 'Confirm mint',
            body: 'Submit on Base Sepolia. On zap, leftover tNVDA/tMSFT (not unused USDC) is refunded.',
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
            Pay with USDC (zap)
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {mode === 'inkind' ? (
            <Field
              label="Shares to mint (gross)"
              help="Gross shares before the 10 bps mint fee. You must hold the basket amounts below."
            >
              <input className={inputClass} value={gross} onChange={(e) => setGross(e.target.value)} />
            </Field>
          ) : (
            <Field
              label="USDC to spend"
              help="Entire amount is split across tNVDA/tMSFT buys. Preview shares assume $1 NAV."
            >
              <input className={inputClass} value={usdcSpend} onChange={(e) => setUsdcSpend(e.target.value)} />
            </Field>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Stat
            label="You receive (preview)"
            value={fmtUnits(userShares)}
            help="userShares after fee from previewMint. Zap slippage can change this."
          />
          <Stat
            label="Share fee"
            value={fmtUnits(feeShares)}
            hint="~10 bps"
            help="Typically 10 bps of gross shares to treasury."
          />
          <Stat label="Index" value={shortAddr(index)} />
        </div>

        {mode === 'zap' && (
          <p className="mt-3 text-xs text-slate-500">
            Spending {usdcSpend || '0'} USDC requests ~{usdcSpend || '0'} shares at $1 NAV. The router
            spends this USDC in the stock pools; leftover tNVDA/tMSFT returns to your wallet.
          </p>
        )}

        {required && constituents && (
          <div className="mt-4 overflow-x-auto">
            <p className="mb-2 text-xs font-medium text-slate-500">Basket required (ceil)</p>
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

        {mode === 'inkind' ? (
          <TxGate require={['ai2']} actionLabel="in-kind mint">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={approveConstituents}>
                Approve next basket token
              </button>
              <button type="button" className={btnPrimary} disabled={isPending || !address} onClick={mintInKind}>
                Mint shares
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        ) : (
          <TxGate require={['ai2', 'zap', 'usdc']} actionLabel="USDC zap mint">
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdcZap}>
                Approve USDC for zap
              </button>
              <button type="button" className={btnPrimary} disabled={isPending} onClick={mintZap}>
                Mint with USDC
              </button>
            </div>
            <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          </TxGate>
        )}
      </Panel>
    </div>
  );
}
