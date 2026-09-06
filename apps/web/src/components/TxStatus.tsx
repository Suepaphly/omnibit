'use client';

export function TxStatus({
  hash,
  isPending,
  isConfirming,
  isSuccess,
  error,
}: {
  hash?: `0x${string}`;
  isPending?: boolean;
  isConfirming?: boolean;
  isSuccess?: boolean;
  error?: Error | null;
}) {
  if (!hash && !isPending && !error) return null;
  return (
    <div className="mt-3 space-y-1.5 rounded-xl border border-canvas-border/70 bg-canvas/50 px-3 py-2.5 text-xs">
      {isPending && (
        <p className="flex items-center gap-2 text-slate-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Confirm in wallet…
        </p>
      )}
      {isConfirming && hash && (
        <p className="text-slate-300">
          Confirming{' '}
          <a
            className="font-mono text-accent-soft underline decoration-accent/40 underline-offset-2 hover:text-accent"
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {hash.slice(0, 10)}…
          </a>
        </p>
      )}
      {isSuccess && (
        <p className="flex items-center gap-2 font-medium text-ok">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" />
          Confirmed on Base Sepolia.
        </p>
      )}
      {error && <p className="break-all text-danger">{error.message}</p>}
    </div>
  );
}
