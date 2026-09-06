'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Overview' },
  { href: '/launch', label: 'Launch' },
  { href: '/vault', label: 'Vault' },
  { href: '/mint', label: 'Mint' },
  { href: '/trade', label: 'Trade' },
  { href: '/accretion', label: 'Accretion' },
  { href: '/redeem', label: 'Redeem' },
  { href: '/docs', label: 'Docs' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? 'rounded-md bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent-soft'
                : 'rounded-md px-3 py-1.5 text-sm text-slate-400 hover:bg-canvas-raised hover:text-slate-200'
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
