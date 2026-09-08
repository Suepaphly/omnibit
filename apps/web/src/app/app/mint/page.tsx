'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, maxUint256, formatUnits } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses, hasAddress } from '@/config/addresses';
import { AccretiveIndexAbi, IndexZapRouterAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, fmtUnits, shortAddr } from '@/lib/format';

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

const quoterAbi = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const;

function stockKey(token: `0x${string}`) {
  return {
    currency0: USDC,
    currency1: token,
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000' as const,
  };
}

export default function MintPage() {
  const { address } = useAccount();
  const client = usePublicClient();
  const index = addresses.ai2;
  const zap = addresses.zap;
  const usdc = addresses.usdc;
  const quoter = addresses.quoter;
  const [gross, setGross] = useState('0.01');
  const [usdcSpend, setUsdcSpend] = useState('1');
  const [mode, setMode] = useState<'inkind' | 'zap'>('zap');
  const [qNvda, setQNvda] = useState<bigint | undefined>();
  const [qMsft, setQMsft] = useState<bigint | undefined>();
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

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

  const perLeg = zapUsdc / 2n;

  const { data: previewOne } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'previewMint',
    args: [10n ** 18n],
    query: { enabled: hasAddress(index) },
  });

  const { data: previewGross } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'previewMint',
    args: grossShares > 0n ? [grossShares] : undefined,
    query: { enabled: hasAddress(index) && mode === 'inkind' && grossShares > 0n },
  });

  const { data: constituents } = useReadContract({
    address: index,
    abi: AccretiveIndexAbi,
    functionName: 'constituents',
    query: { enabled: hasAddress(index) },
  });

  const oneShareBasket = previewOne?.[0] as bigint[] | undefined;
  const mintFeeBpsGuess =
    previewOne && previewOne[2] !== undefined && previewOne[1] !== undefined
      ? Number((previewOne[2] * 10_000n) / (previewOne[1] + previewOne[2] || 1n))
      : 10;

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setQuoteErr(null);
      if (!client || !quoter || perLeg === 0n || !addresses.tNVDA || !addresses.tMSFT) {
        setQNvda(undefined);
        setQMsft(undefined);
        return;
      }
      try {
        const [nvda, msft] = await Promise.all([
          client.simulateContract({
            address: quoter,
            abi: quoterAbi,
            functionName: 'quoteExactInputSingle',
            args: [
              {
                poolKey: stockKey(addresses.tNVDA),
                zeroForOne: true,
                exactAmount: perLeg,
                hookData: '0x',
              },
            ],
          }),
          client.simulateContract({
            address: quoter,
            abi: quoterAbi,
            functionName: 'quoteExactInputSingle',
            args: [
              {
                poolKey: stockKey(addresses.tMSFT),
                zeroForOne: true,
                exactAmount: perLeg,
                hookData: '0x',
              },
            ],
          }),
        ]);
        if (cancelled) return;
        setQNvda(nvda.result[0]);
        setQMsft(msft.result[0]);
      } catch (e) {
        if (!cancelled) {
          setQNvda(undefined);
          setQMsft(undefined);
          setQuoteErr(e instanceof Error ? e.message : 'quote failed');
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [client, quoter, perLeg, addresses.tNVDA, addresses.tMSFT]);

  const bNvda = oneShareBasket?.[0];
  const bMsft = oneShareBasket?.[1];

  const estimatedShares = useMemo(() => {
    if (!qNvda || !qMsft || !bNvda || !bMsft || bNvda === 0n || bMsft === 0n) return undefined;
    const fromNvda = (qNvda * 10n ** 18n) / bNvda;
    const fromMsft = (qMsft * 10n ** 18n) / bMsft;
    const raw = fromNvda < fromMsft ? fromNvda : fromMsft;
    return (raw * 99n) / 100n;
  }, [qNvda, qMsft, bNvda, bMsft]);

  const userReceives =
    estimatedShares !== undefined ? (estimatedShares * BigInt(10_000 - mintFeeBpsGuess)) / 10_000n : undefined;
  const feeShares =
    estimatedShares !== undefined && userReceives !== undefined ? estimatedShares - userReceives : undefined;

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

  function mintInKind(shares: bigint) {
    if (!index || !address || shares === 0n) return;
    reset();
    writeContract({
      address: index,
      abi: AccretiveIndexAbi,
      functionName: 'mintExactShares',
      args: [shares, address],
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
    writeContract({
      address: zap,
      abi: IndexZapRouterAbi,
      functionName: 'buyTargetBasket',
      args: [
        constituents as `0x${string}`[],
        constituents.map(() => 5000),
        zapUsdc,
        constituents.map(() => 0n),
        deadlineSeconds(),
      ],
    });
  }

  const inKindRequired = previewGross?.[0] as bigint[] | undefined;
  const inKindUser = previewGross?.[1] as bigint | undefined;
  const inKindFee = previewGross?.[2] as bigint | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mint"
        subtitle="USDC mode quotes the two stock pools, then mints the shares that basket can cover. In-kind is the inverse."
      />

      <StepsGuide
        title="Two inverse flows"
        defaultOpen
        steps={[
          {
            title: 'Pay with USDC',
            body: 'You type USDC. App quotes tNVDA + tMSFT from the V4 quoter, then estimated shares = min(Q/B).',
          },
          {
            title: 'In-kind',
            body: 'You type shares. App uses previewMint for required tNVDA + tMSFT.',
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
            Pay with USDC
          </button>
        </div>

        {mode === 'zap' ? (
          <>
            <Field label="USDC to spend" help="Split 50/50 across the two stock pools. Quotes update from V4 Quoter.">
              <input className={inputClass} value={usdcSpend} onChange={(e) => setUsdcSpend(e.target.value)} />
            </Field>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Stat label="USDC per pool" value={fmtUnits(perLeg, 6)} />
              <Stat label="Est. tNVDA bought" value={qNvda !== undefined ? formatUnits(qNvda, 18) : '—'} />
              <Stat label="Est. tMSFT bought" value={qMsft !== undefined ? formatUnits(qMsft, 18) : '—'} />
              <Stat label="Est. INDEX (gross)" value={fmtUnits(estimatedShares)} hint="min(Q/B) · 99%" />
              <Stat label="Mint fee" value={fmtUnits(feeShares)} hint={`~${mintFeeBpsGuess} bps`} />
              <Stat label="Est. INDEX after fee" value={fmtUnits(userReceives)} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              1 share basket from previewMint: {fmtUnits(bNvda)} tNVDA + {fmtUnits(bMsft)} tMSFT. Allocation 50% / 50%
              USDC. Quote uses {shortAddr(quoter)}.
            </p>
            {quoteErr && <p className="mt-2 text-xs text-red-400">Quote failed: {quoteErr.slice(0, 180)}</p>}
            <TxGate require={['ai2', 'zap', 'usdc']} actionLabel="USDC basket buy">
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdcZap}>
                  Approve USDC
                </button>
                <button type="button" className={btnPrimary} disabled={isPending || zapUsdc === 0n} onClick={buyBasket}>
                  Buy basket
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={isPending}
                  onClick={() => approveToken(addresses.tNVDA)}
                >
                  Approve tNVDA
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={isPending}
                  onClick={() => approveToken(addresses.tMSFT)}
                >
                  Approve tMSFT
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={isPending || !address || !estimatedShares}
                  onClick={() => estimatedShares && mintInKind(estimatedShares)}
                >
                  Mint estimated shares
                </button>
              </div>
              <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
            </TxGate>
          </>
        ) : (
          <>
            <Field label="Shares to mint (gross)" help="previewMint returns required tNVDA / tMSFT.">
              <input className={inputClass} value={gross} onChange={(e) => setGross(e.target.value)} />
            </Field>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="You receive" value={fmtUnits(inKindUser)} />
              <Stat label="Share fee" value={fmtUnits(inKindFee)} />
              <Stat label="Index" value={shortAddr(index)} />
            </div>
            {inKindRequired && constituents && (
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-xs font-medium text-slate-500">You need</p>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">Asset</th>
                      <th className="py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {constituents.map((c, i) => (
                      <tr key={c} className="border-t border-canvas-border/60 font-mono text-xs">
                        <td className="py-2 pr-3">{shortAddr(c)}</td>
                        <td className="py-2">{fmtUnits(inKindRequired[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TxGate require={['ai2', 'zap', 'usdc']} actionLabel="USDC zap mint">
              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} disabled={isPending} onClick={approveUsdcZap}>
                  Approve USDC
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={isPending || !estimatedShares || zapUsdc === 0n}
                  onClick={() => {
                    if (!zap || !index || !estimatedShares) return;
                    reset();
                    writeContract({
                      address: zap,
                      abi: IndexZapRouterAbi,
                      functionName: 'mintExactSharesWithUSDC',
                      args: [index, estimatedShares, zapUsdc, deadlineSeconds()],
                    });
                  }}
                >
                  Mint with USDC
                </button>
              </div>
              <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
            </TxGate>
          </>
        )}
      </Panel>
    </div>
  );
}
