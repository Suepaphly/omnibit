'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  { href: '/app', label: 'App', match: (p: string) => p === '/app' || p.startsWith('/app/') },
  { href: '/docs', label: 'Docs', match: (p: string) => p === '/docs' || p.startsWith('/docs/') },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label="Primary">
      {links.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? 'nav-pill nav-pill-active' : 'nav-pill nav-pill-idle'}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
