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
            className="rounded-lg border border-warn/40 bg-warn/15 px-3 py-1.5 text-xs font-semibold text-warn transition hover:bg-warn/25"
            onClick={() => switchChain?.({ chainId: baseSepolia.id })}
          >
            Switch to Base Sepolia
          </button>
        )}
        {!wrongChain && (
          <span className="chain-badge hidden sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" />
            Sepolia
          </span>
        )}
        <span className="rounded-lg border border-canvas-border bg-canvas/80 px-3 py-1.5 font-mono text-xs text-slate-200">
          {shortAddr(address)}
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="rounded-lg border border-canvas-border px-3 py-1.5 text-xs text-slate-400 transition hover:border-canvas-border-strong hover:text-slate-200"
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
            className="btn-primary !px-3 !py-1.5 !text-xs"
          >
            {c.name}
          </button>
        ))}
      </div>
      {!walletConnectConfigured && (
        <p className="max-w-[14rem] text-right text-[10px] text-slate-500">
          WalletConnect disabled — set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
        </p>
      )}
      {error && <p className="max-w-xs text-right text-[10px] text-danger">{error.message}</p>}
    </div>
  );
}
