'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/app', label: 'Overview', exact: true },
  { href: '/app/launch', label: 'Launch' },
  { href: '/app/mint', label: 'Mint' },
  { href: '/app/trade', label: 'Trade' },
  { href: '/app/accretion', label: 'Accretion' },
  { href: '/app/redeem', label: 'Redeem' },
  { href: '/app/vault', label: 'Vault' },
];

export function AppSubnav() {
  const pathname = usePathname();
  return (
    <nav
      className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-canvas-border/80 bg-canvas-raised/50 p-1 backdrop-blur-sm"
      aria-label="App console"
    >
      {links.map((l) => {
        const active = l.exact
          ? pathname === l.href
          : pathname === l.href || pathname.startsWith(l.href + '/');
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? 'nav-pill nav-pill-active whitespace-nowrap'
                : 'nav-pill nav-pill-idle whitespace-nowrap'
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
