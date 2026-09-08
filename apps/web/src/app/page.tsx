import Link from 'next/link';
import { LogoMark } from '@/components/Logo';

const features = [
  {
    title: 'Fully backed shares',
    desc: 'Every index share maps to a pro-rata claim on tracked basket assets — mint and redeem in-kind with clear accounting.',
    icon: (
      <path
        d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Accretion, not dilution',
    desc: 'Protocol fees flow into the vault as more underlying — NAV grows for holders without minting new shares.',
    icon: (
      <path
        d="M4 16l4-4 3 3 5-6 4 2M4 20h16"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    accent: 'accretion' as const,
  },
  {
    title: 'Index AI2 on Base',
    desc: 'Equal-weight tNVDA / tMSFT synthetic basket on Base Sepolia — launch, mint, trade, sweep, and harvest from one console.',
    icon: (
      <path
        d="M5 12h14M12 5v14M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Transparent fees',
    desc: 'Mint/redeem fees, V4 LP fee, and protocol hook fee are each surfaced separately so economics stay inspectable.',
    icon: (
      <path
        d="M12 3v18M8 7h6a2.5 2.5 0 010 5H8m0 0h7a2.5 2.5 0 010 5H8"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
];

const steps = [
  { n: '01', title: 'Trade on the pool', body: 'AI2 ↔ USDC on Uniswap V4. LP fee stays with LPs; hook fee accrues in USDC.' },
  { n: '02', title: 'Sweep fees', body: 'sweepFees splits pendingHookUsdc between treasury and the Accretion Cauldron.' },
  { n: '03', title: 'Harvest into basket', body: 'Cauldron buys underlying constituents and depositAccretion creates zero new shares, but increases NAV.' },
];

const fees = [
  { label: 'Mint / redeem', value: '10 bps', hint: 'Share fee to treasury' },
  { label: 'Pool LP', value: '5 bps', hint: 'Stays with LPs (fee=500)' },
  { label: 'Protocol hook', value: '5 bps', hint: 'USDC → pendingHookUsdc' },
  { label: 'Accretion split', value: '50 / 50', hint: 'Treasury / Engine on sweep' },
];

export default function HomePage() {
  return (
    <div className="space-y-16 pb-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-canvas-border/80 bg-canvas-raised/50 px-6 py-12 shadow-panel sm:px-10 sm:py-16">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/4 h-56 w-56 rounded-full bg-accretion/10 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <div className="mb-6 flex justify-center">
            <LogoMark className="h-14 w-14 drop-shadow-[0_0_16px_rgba(34,211,238,0.35)]" />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-soft">
            Omnibit · Index Forge
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl sm:leading-tight">
            Fully backed index shares that{' '}
            <span className="bg-gradient-to-r from-accent via-accent-soft to-accretion-soft bg-clip-text text-transparent">
              accrete without dilution
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
            A Base Sepolia testnet protocol for launching accretive indexes: in-kind mint & redeem,
            V4 trading with a protocol fee hook, and a harvest loop that compounds underlying into
            existing shares.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="btn-primary !px-6 !py-2.5">
              Open App
            </Link>
            <Link href="/docs" className="btn-secondary !px-6 !py-2.5">
              Read Docs
            </Link>
          </div>
          <p className="mt-4 text-[11px] text-slate-500">
            Unaudited MVP · Base Sepolia (84532) · synthetic test B20s only
          </p>
        </div>
      </section>

      {/* Features */}
      <section>
        <div className="mb-6 text-center sm:text-left">
          <h2 className="text-xl font-semibold text-slate-50">Built for serious index mechanics</h2>
          <p className="mt-1 text-sm text-slate-400">
            Product surface for operators and testers — not a marketing shell over vaporware.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-canvas-border/80 bg-canvas-raised/60 p-5 transition hover:border-accent/30 hover:shadow-glow-sm"
            >
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${
                  f.accent === 'accretion'
                    ? 'border-accretion/30 bg-accretion/10 text-accretion-soft'
                    : 'border-accent/30 bg-accent/10 text-accent-soft'
                }`}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How accretion works */}
      <section className="rounded-2xl border border-canvas-border/80 bg-canvas-raised/40 p-6 sm:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accretion-soft">
              Accretion loop
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-50">How value compounds</h2>
          </div>
          <Link href="/app/accretion" className="text-sm text-accent-soft hover:underline">
            Open accretion console →
          </Link>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="relative rounded-xl border border-canvas-border/70 bg-canvas/50 p-4"
            >
              <span className="font-mono text-xs text-accretion-soft">{s.n}</span>
              <h3 className="mt-2 font-medium text-slate-100">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Index AI2 + fees */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-canvas-border/80 bg-canvas-raised/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-soft">Flagship</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">Index AI2</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Equal-weight basket of synthetic tNVDA and tMSFT on Base Sepolia. Seed near $1 NAV,
            trade on a canonical INDEX/USDC V4 pool, and watch cumulativeAccretedUsdWad climb as
            fees are harvested into the vault.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/app/vault" className="btn-secondary !text-xs">
              Vault
            </Link>
            <Link href="/app/mint" className="btn-secondary !text-xs">
              Mint
            </Link>
            <Link href="/app/trade" className="btn-secondary !text-xs">
              Trade
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-canvas-border/80 bg-canvas-raised/60 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-soft">
            Fees at a glance
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">Economics you can audit</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {fees.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-canvas-border/70 bg-canvas/50 px-3 py-3"
              >
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">{f.label}</dt>
                <dd className="mt-0.5 font-mono text-sm text-slate-100">{f.value}</dd>
                <dd className="text-[11px] text-slate-500">{f.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-canvas-raised/80 to-accretion/5 px-6 py-10 text-center shadow-glow-sm">
        <h2 className="text-xl font-semibold text-slate-50">Ready to smoke-test the protocol?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
          Wire deployment addresses into <code className="font-mono text-accent-soft">.env.local</code>,
          connect a Base Sepolia wallet, and walk Launch → Mint → Trade → Accretion → Redeem.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/app" className="btn-primary !px-6 !py-2.5">
            Open App
          </Link>
          <Link href="/docs/runbook" className="btn-secondary !px-6 !py-2.5">
            Deploy runbook
          </Link>
        </div>
      </section>
    </div>
  );
}
