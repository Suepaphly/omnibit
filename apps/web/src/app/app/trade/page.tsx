'use client';

import { useMemo, useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeAbiParameters, maxUint256, parseUnits, type Hex } from 'viem';
import { Panel, Field, inputClass, btnPrimary, btnSecondary } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { addresses } from '@/config/addresses';
import { erc20Abi } from '@/abi';
import { deadlineSeconds } from '@/lib/format';

const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const;
const HOOK = '0x9DE085DfE6f3eD3c340d1Dd4F53a5EB8eA23A0CC' as const;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
const AI2 = '0x8ae66f48Dd737F98FA2C5E8C5826aE497A8B9790' as const;

const permit2Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const;

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

const poolKey = {
  currency0: USDC,
  currency1: AI2,
  fee: 500,
  tickSpacing: 10,
  hooks: HOOK,
} as const;

function encodeV4ExactIn(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint) {
  const zeroForOne = tokenIn.toLowerCase() === USDC.toLowerCase();
  const actions = '0x060c0f' as Hex;
  const swapParams = encodeAbiParameters(
    [
      {
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
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey,
        zeroForOne,
        amountIn,
        amountOutMinimum: 0n,
        hookData: '0x',
      },
    ],
  );
  const settle = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [tokenIn, amountIn],
  );
  const take = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [tokenOut, 0n],
  );
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [swapParams, settle, take]],
  );
}

export default function TradePage() {
  const { address } = useAccount();
  const router = addresses.universalRouter;
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('1');

  const tokenIn = direction === 'buy' ? USDC : AI2;
  const tokenOut = direction === 'buy' ? AI2 : USDC;
  const inDecimals = direction === 'buy' ? 6 : 18;

  const parsedIn = useMemo(() => {
    try {
      return parseUnits(amount || '0', inDecimals);
    } catch {
      return 0n;
    }
  }, [amount, inDecimals]);

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function approvePermit2() {
    reset();
    writeContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PERMIT2, maxUint256],
    });
  }

  function approveRouterViaPermit2() {
    if (!router) return;
    reset();
       const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
    writeContract({
      address: PERMIT2,
      abi: permit2Abi,
      functionName: 'approve',
      args: [tokenIn, router, 2n ** 160n - 1n, exp],
    });
  }

  function swap() {
    if (!router || !address || parsedIn === 0n) return;
    reset();
    writeContract({
      address: router,
      abi: universalRouterAbi,
      functionName: 'execute',
      args: ['0x10', [encodeV4ExactIn(tokenIn, tokenOut, parsedIn)], deadlineSeconds()],
      value: 0n,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade"
        subtitle="Swap USDC ↔ AI2 on the V4 pool (fee 500, IndexFeeHook). Router pulls tokens through Permit2."
      />

      <Panel title="Swap">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={direction === 'buy' ? btnPrimary : btnSecondary}
            onClick={() => setDirection('buy')}
          >
            Buy AI2 with USDC
          </button>
          <button
            type="button"
            className={direction === 'sell' ? btnPrimary : btnSecondary}
            onClick={() => setDirection('sell')}
          >
            Sell AI2 for USDC
          </button>
        </div>
        <Field label={direction === 'buy' ? 'USDC to spend' : 'AI2 to sell'} help="Start with 1 USDC or 0.1 AI2.">
          <input className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <TxGate require={['ai2', 'usdc', 'universalRouter']} actionLabel="swap">
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={isPending} onClick={approvePermit2}>
              1. Approve token for Permit2
            </button>
            <button type="button" className={btnSecondary} disabled={isPending} onClick={approveRouterViaPermit2}>
              2. Permit2 → Universal Router
            </button>
            <button type="button" className={btnPrimary} disabled={isPending || parsedIn === 0n} onClick={swap}>
              3. Swap
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Pool USDC / AI2 · fee 500 · tickSpacing 10 · hook {HOOK.slice(0, 8)}… Commands 0x10 / actions 0x06,0x0c,0x0f.
          </p>
          <TxStatus hash={hash} isPending={isPending} isConfirming={isConfirming} isSuccess={isSuccess} error={error} />
        </TxGate>
      </Panel>
    </div>
  );
}
