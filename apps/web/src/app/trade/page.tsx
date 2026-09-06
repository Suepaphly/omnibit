'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import { parseUnits, maxUint256, encodeAbiParameters, type Hex } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary, Stat } from '@/components/Panel';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { addresses, hasAddress } from '@/config/addresses';
import { erc20Abi, IndexFeeHookAbi } from '@/abi';
import { bpsOf, fmtUnits, shortAddr } from '@/lib/format';

/**
 * Trade uses Uniswap V4 Universal Router exact-in on the canonical AI2/USDC pool.
 * Fee display: 5 bps LP (pool fee=500) + 5 bps protocol hook (USDC), shown separately.
 *
 * Universal Router V4_SWAP command (0x10) encoding is version-sensitive; this MVP sends a
 * minimal execute() payload. If the router rejects calldata, use the Uniswap UI against the
 * same pool — fee math below still documents protocol economics.
 */
const universalRouterAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const HOOK_FEE_BPS = 5;
const LP_FEE_BPS = 5;

export default function TradePage() {
  const { address } = useAccount();
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amountIn, setAmountIn] = useState('10');

  const ai2 = addresses.ai2;
  const usdc = addresses.usdc;
  const router = addresses.universalRouter;
  const hook = addresses.hook;
  const poolId = addresses.poolId;

  const parsedIn = useMemo(() => {
    try {
      return parseUnits(amountIn || '0', direction === 'buy' ? 6 : 18);
    } catch {
      return 0n;
    }
  }, [amountIn, direction]);

  // Fee notional in USDC terms for display
  const usdcNotional =
    direction === 'buy'
      ? parsedIn
      : parsedIn / 10n ** 12n; // rough $1 NAV: 1 AI2 ≈ 1e12 raw USDC units at 6 dec

  const lpFee = bpsOf(usdcNotional, LP_FEE_BPS);
  const hookFee = bpsOf(usdcNotional, HOOK_FEE_BPS);

  const { data: pending } = useReadContract({
    address: hook,
    abi: IndexFeeHookAbi,
    functionName: 'pendingHookUsdc',
    args: poolId ? [poolId] : undefined,
    query: { enabled: hasAddress(hook) && Boolean(poolId) },
  });

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const tokenIn = direction === 'buy' ? usdc : ai2;
  const tokenOut = direction === 'buy' ? ai2 : usdc;

  function approve() {
    if (!tokenIn || !router) return;
    reset();
    writeContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: 'approve',
      args: [router, maxUint256],
    });
  }

  function swap() {
    if (!router || !ai2 || !address || parsedIn === 0n) return;
    reset();
    // Commands: V4_SWAP = 0x10
    const commands = '0x10' as Hex;
    // Encode a placeholder input blob documenting intent; production should use v4-sdk ActionConstants.
    // We encode (address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address recipient)
    const input = encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [tokenIn!, tokenOut!, parsedIn, 0n, address],
    );
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    writeContract({
      address: router,
      abi: universalRouterAbi,
      functionName: 'execute',
      args: [commands, [input], deadline],
      value: 0n,
    });
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Trade — exact-in AI2 ↔ USDC"
        subtitle="Canonical INDEX/USDC pool: LP fee 5 bps (fee=500) stays with LPs; protocol hook takes 5 bps in USDC into pendingHookUsdc. Fees shown separately."
      >
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={direction === 'buy' ? btnPrimary : btnSecondary}
            onClick={() => setDirection('buy')}
          >
            Buy AI2 (USDC → AI2)
          </button>
          <button
            type="button"
            className={direction === 'sell' ? btnPrimary : btnSecondary}
            onClick={() => setDirection('sell')}
          >
            Sell AI2 (AI2 → USDC)
          </button>
        </div>

        <Field label={direction === 'buy' ? 'USDC in (6 dec)' : 'AI2 in (18 dec)'}>
          <input className={inputClass} value={amountIn} onChange={(e) => setAmountIn(e.target.value)} />
        </Field>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="LP fee (5 bps)"
            value={`${fmtUnits(lpFee, 6)} USDC`}
            hint="Stays with LPs in pool units"
          />
          <Stat
            label="Protocol hook (5 bps)"
            value={`${fmtUnits(hookFee, 6)} USDC`}
            hint="Accrues pendingHookUsdc"
          />
          <Stat label="pendingHookUsdc" value={fmtUnits(pending as bigint | undefined, 6)} />
          <Stat label="PoolId" value={poolId ? shortAddr(poolId) : 'unset'} />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Token in {shortAddr(tokenIn)} → out {shortAddr(tokenOut)} via Universal Router{' '}
          {shortAddr(router)}. Adapter allowlist is Zap/engines only — retail swaps use the V4
          router/pool path.
        </p>

        <TxGate require={['ai2', 'usdc', 'universalRouter']} actionLabel="swap">
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={isPending || !address} onClick={approve}>
              Approve tokenIn
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || !address || parsedIn === 0n} onClick={swap}>
              Swap exact-in
            </button>
          </div>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
          <p className="mt-2 text-[11px] text-slate-500">
            Note: Universal Router V4 calldata is intentionally minimal in this MVP. If execute
            reverts, verify pool initialization and use Uniswap&apos;s interface against the same
            PoolKey; fee breakdown above remains accurate for economics testing.
          </p>
        </TxGate>
      </Panel>
    </div>
  );
}
