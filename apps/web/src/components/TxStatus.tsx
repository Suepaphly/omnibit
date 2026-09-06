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
    <div className="mt-3 space-y-1 text-xs">
      {isPending && <p className="text-slate-400">Confirm in wallet…</p>}
      {isConfirming && hash && (
        <p className="text-slate-400">
          Confirming{' '}
          <a
            className="font-mono text-accent-soft underline"
            href={`https://sepolia.basescan.org/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {hash.slice(0, 10)}…
          </a>
        </p>
      )}
      {isSuccess && <p className="text-ok">Confirmed on Base Sepolia.</p>}
      {error && <p className="text-danger break-all">{error.message}</p>}
    </div>
  );
}
