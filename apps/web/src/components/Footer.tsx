import Link from 'next/link';

export function Footer() {
  return (
    <footer className="mt-auto border-t border-canvas-border/80 bg-canvas/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-200">
            Omnibit <span className="text-accent">Index Forge</span>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            Fully backed index shares that accrete without dilution. Base Sepolia MVP console —
            unaudited protocol software for testing only.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          <Link href="/docs" className="text-slate-400 transition hover:text-accent-soft">
            Docs
          </Link>
          <Link href="/docs/architecture" className="text-slate-400 transition hover:text-accent-soft">
            Architecture
          </Link>
          <Link href="/docs/runbook" className="text-slate-400 transition hover:text-accent-soft">
            Runbook
          </Link>
          <Link href="/docs/security" className="text-slate-400 transition hover:text-accent-soft">
            Security
          </Link>
          <Link href="/app" className="text-slate-400 transition hover:text-accent-soft">
            Open App
          </Link>
          <a
            href="https://docs.base.org"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 transition hover:text-accent-soft"
          >
            Base docs ↗
          </a>
        </div>
      </div>
      <div className="border-t border-canvas-border/60 bg-canvas-raised/60 px-4 py-2.5 text-center text-[11px] leading-relaxed text-amber-100/75">
        <strong className="font-semibold text-accretion-soft">Testnet:</strong> tNVDA / tMSFT are
        synthetic test B20s — not Coinbase live tokenized stocks. Unaudited · Base Sepolia only.
      </div>
    </footer>
  );
}
