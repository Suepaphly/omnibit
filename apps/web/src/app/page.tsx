import Link from 'next/link';
import { Panel, Stat } from '@/components/Panel';
import { addresses, hasAddress } from '@/config/addresses';
import { shortAddr } from '@/lib/format';

const screens = [
  { href: '/launch', title: 'Launch', desc: 'createSeed + initializeMarket (two-tx)' },
  { href: '/vault', title: 'Vault', desc: 'tracked vs raw, supply, NAV / UsdWad' },
  { href: '/mint', title: 'Mint', desc: 'previewMint + mintExactShares / USDC zap' },
  { href: '/trade', title: 'Trade', desc: 'exact-in AI2 ↔ USDC · LP vs hook fees' },
  { href: '/accretion', title: 'Accretion', desc: 'pendingHookUsdc · sweep · harvest' },
  { href: '/redeem', title: 'Redeem', desc: 'previewRedeem + in-kind redeem' },
  { href: '/docs', title: 'Docs', desc: 'Architecture, accounting, security, glossary' },
];

export default function HomePage() {
  const configured = [
    ['Factory', addresses.factory],
    ['Launcher', addresses.launcher],
    ['Hook', addresses.hook],
    ['Zap', addresses.zap],
    ['AI2', addresses.ai2],
    ['Engine', addresses.engine],
  ] as const;

  return (
    <div className="space-y-6">
      <Panel
        title="Sepolia test console"
        subtitle="Live-testing surface for Omnibit Index Forge on Base Sepolia. Not a marketing site — wire env addresses after broadcast and smoke-test each screen."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {configured.map(([label, addr]) => (
            <Stat
              key={label}
              label={label}
              value={hasAddress(addr) ? shortAddr(addr) : 'unset'}
              hint={hasAddress(addr) ? undefined : 'set NEXT_PUBLIC_*'}
            />
          ))}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-canvas-border bg-canvas-raised/50 p-4 transition hover:border-accent/40 hover:bg-canvas-raised"
          >
            <div className="font-medium text-slate-100">{s.title}</div>
            <div className="mt-1 text-sm text-slate-400">{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
