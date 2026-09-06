'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';

const CHAIN_LABEL = 'Base Sepolia';
const CHAIN_ID = 84532;

/** Static / live network pill — always names Base Sepolia (84532). */
export function NetworkBadge({
  showId = true,
  className = '',
}: {
  showId?: boolean;
  className?: string;
}) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const onTarget = !isConnected || chainId === baseSepolia.id;

  return (
    <span
      className={`chain-badge ${onTarget ? '' : '!border-warn/40 !bg-warn/15 !text-warn'} ${className}`}
      title={`${CHAIN_LABEL} (chain id ${CHAIN_ID})`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${onTarget ? 'bg-ok animate-pulse-soft' : 'bg-warn'}`} />
      {CHAIN_LABEL}
      {showId && <span className="opacity-70">· {CHAIN_ID}</span>}
    </span>
  );
}

/** Banner when wallet is on the wrong chain — asks to switch to Base Sepolia. */
export function WrongNetworkBanner() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const wrong = isConnected && chainId !== baseSepolia.id;

  if (!wrong) return null;

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-amber-100"
      role="alert"
    >
      <div>
        <p className="font-semibold text-accretion-soft">Wrong network</p>
        <p className="mt-0.5 text-amber-100/85">
          This console only works on <strong>Base Sepolia</strong> (chain id {CHAIN_ID}). Your wallet
          is on chain {chainId}.
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-warn/50 bg-warn/20 px-3 py-2 text-xs font-semibold text-warn transition hover:bg-warn/30 disabled:opacity-50"
        disabled={isPending || !switchChain}
        onClick={() => switchChain?.({ chainId: baseSepolia.id })}
      >
        {isPending ? 'Switching…' : 'Switch to Base Sepolia'}
      </button>
    </div>
  );
}
