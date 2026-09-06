'use client';

import type { ReactNode } from 'react';
import { addresses, hasAddress } from '@/config/addresses';

type Key = keyof typeof addresses;

export function TxGate({
  require,
  children,
  actionLabel = 'this action',
}: {
  require: Key[];
  children: ReactNode;
  actionLabel?: string;
}) {
  const missing = require.filter((k) => {
    if (k === 'poolId') return !addresses.poolId;
    return !hasAddress(addresses[k] as `0x${string}` | undefined);
  });

  if (missing.length === 0) return <>{children}</>;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium">Transactions disabled for {actionLabel}</p>
        <p className="mt-1 text-amber-100/80">
          Missing env address(es):{' '}
          <code className="font-mono text-xs">
            {missing.map((k) => envKey(k)).join(', ')}
          </code>
          . Fill <code className="font-mono text-xs">.env.local</code> from{' '}
          <code className="font-mono text-xs">.env.example</code> after Sepolia deploy, then
          rebuild.
        </p>
      </div>
      <div className="pointer-events-none select-none opacity-40">{children}</div>
    </div>
  );
}

function envKey(k: Key): string {
  const map: Record<string, string> = {
    factory: 'NEXT_PUBLIC_INDEX_FACTORY',
    launcher: 'NEXT_PUBLIC_INDEX_LAUNCHER',
    hook: 'NEXT_PUBLIC_INDEX_FEE_HOOK',
    zap: 'NEXT_PUBLIC_INDEX_ZAP_ROUTER',
    adapter: 'NEXT_PUBLIC_SWAP_ADAPTER',
    treasury: 'NEXT_PUBLIC_PROTOCOL_TREASURY',
    ai2: 'NEXT_PUBLIC_AI2_INDEX',
    engine: 'NEXT_PUBLIC_AI2_ENGINE',
    poolId: 'NEXT_PUBLIC_AI2_POOL_ID',
    tNVDA: 'NEXT_PUBLIC_TNVDA',
    tMSFT: 'NEXT_PUBLIC_TMSFT',
    usdc: 'NEXT_PUBLIC_USDC_ADDRESS',
    poolManager: 'NEXT_PUBLIC_V4_POOL_MANAGER',
    universalRouter: 'NEXT_PUBLIC_V4_UNIVERSAL_ROUTER',
    stateView: 'NEXT_PUBLIC_V4_STATE_VIEW',
    quoter: 'NEXT_PUBLIC_V4_QUOTER',
  };
  return map[k] ?? String(k);
}
