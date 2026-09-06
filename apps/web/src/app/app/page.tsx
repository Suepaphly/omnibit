import Link from 'next/link';
import { Panel, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { addresses, hasAddress } from '@/config/addresses';
import { shortAddr } from '@/lib/format';

const screens = [
  { href: '/app/launch', title: 'Launch', desc: 'createSeed + initializeMarket (two-tx)', tone: 'accent' },
  { href: '/app/vault', title: 'Vault', desc: 'tracked vs raw, supply, NAV / UsdWad', tone: 'accent' },
  { href: '/app/mint', title: 'Mint', desc: 'previewMint + mintExactShares / USDC zap', tone: 'accent' },
  { href: '/app/trade', title: 'Trade', desc: 'exact-in AI2 ↔ USDC · LP vs hook fees', tone: 'accent' },
  { href: '/app/accretion', title: 'Accretion', desc: 'pendingHookUsdc · sweep · harvest', tone: 'accretion' },
  { href: '/app/redeem', title: 'Redeem', desc: 'previewRedeem + in-kind redeem', tone: 'accent' },
];

export default function AppOverviewPage() {
  const configured = [
    ['Factory', addresses.factory],
    ['Launcher', addresses.launcher],
    ['Hook', addresses.hook],
    ['Zap', addresses.zap],
    ['AI2', addresses.ai2],
    ['Engine', addresses.engine],
  ] as const;

  const ready = configured.filter(([, addr]) => hasAddress(addr)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Console"
        subtitle="Live-testing surface for Omnibit Index Forge on Base Sepolia. Wire env addresses after broadcast and smoke-test each flow."
      />

      <Panel
        title="Deployment status"
        subtitle={`${ready} / ${configured.length} core addresses configured from NEXT_PUBLIC_* env.`}
        actions={
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              ready === configured.length
                ? 'bg-ok/15 text-ok'
                : ready === 0
                  ? 'bg-warn/15 text-warn'
                  : 'bg-accent/15 text-accent-soft'
            }`}
          >
            {ready === configured.length ? 'Ready' : ready === 0 ? 'Unset' : 'Partial'}
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {configured.map(([label, addr]) => (
            <Stat
              key={label}
              label={label}
              value={hasAddress(addr) ? shortAddr(addr) : 'unset'}
              hint={hasAddress(addr) ? undefined : 'set NEXT_PUBLIC_*'}
              tone={hasAddress(addr) ? 'ok' : 'warn'}
            />
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-2xl border border-canvas-border/80 bg-canvas-raised/50 p-5 transition hover:border-accent/40 hover:bg-canvas-raised hover:shadow-glow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-slate-100 group-hover:text-white">{s.title}</div>
              <span
                className={`h-2 w-2 rounded-full ${
                  s.tone === 'accretion' ? 'bg-accretion shadow-accretion-glow' : 'bg-accent shadow-glow-sm'
                }`}
              />
            </div>
            <div className="mt-1.5 text-sm text-slate-400">{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
