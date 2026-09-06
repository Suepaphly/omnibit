import Link from 'next/link';

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="1" y="1" width="38" height="38" rx="10" fill="#0d1420" stroke="#1c2a3d" strokeWidth="2" />
      <path
        d="M20 8L30 14V26L20 32L10 26V14L20 8Z"
        stroke="#22d3ee"
        strokeWidth="1.75"
        fill="rgba(34,211,238,0.08)"
      />
      <circle cx="20" cy="20" r="4.5" fill="#f59e0b" fillOpacity="0.9" />
      <circle cx="20" cy="20" r="2" fill="#fcd34d" />
      <path d="M20 12V16M20 24V28M12 20H16M24 20H28" stroke="#22d3ee" strokeWidth="1.25" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function BrandLockup({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3">
      <LogoMark className="h-9 w-9 shrink-0 transition group-hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-slate-50">
          Omnibit <span className="text-accent">Index Forge</span>
        </div>
        <div className="hidden text-[11px] text-slate-500 sm:block">Base Sepolia · testnet console</div>
      </div>
    </Link>
  );
}
