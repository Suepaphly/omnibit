'use client';

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { shortAddr } from '@/lib/format';
import { walletConnectConfigured } from '@/lib/wagmi';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const wrongChain = isConnected && chainId !== baseSepolia.id;

  if (isConnected && address) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {wrongChain && (
          <button
            type="button"
            className="rounded-md bg-warn/20 px-3 py-1.5 text-xs font-medium text-warn"
            onClick={() => switchChain?.({ chainId: baseSepolia.id })}
          >
            Switch to Base Sepolia
          </button>
        )}
        <span className="rounded-md border border-canvas-border bg-canvas-raised px-3 py-1.5 font-mono text-xs text-slate-300">
          {shortAddr(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-md border border-canvas-border px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {connectors.map((c) => (
          <button
            key={c.uid}
            type="button"
            disabled={isPending}
            onClick={() => connect({ connector: c, chainId: baseSepolia.id })}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-muted disabled:opacity-50"
          >
            {c.name}
          </button>
        ))}
      </div>
      {!walletConnectConfigured && (
        <p className="text-[10px] text-slate-500">
          WalletConnect disabled — set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
        </p>
      )}
      {error && <p className="text-[10px] text-danger">{error.message}</p>}
    </div>
  );
}
