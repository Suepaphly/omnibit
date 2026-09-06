import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Nav } from '@/components/Nav';
import { ConnectButton } from '@/components/ConnectButton';
import { Disclaimer } from '@/components/Disclaimer';

export const metadata: Metadata = {
  title: 'Omnibit Index Forge — Sepolia Console',
  description: 'Base Sepolia MVP test console for Omnibit Index Forge (un audited).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col">
        <Providers>
          <header className="sticky top-0 z-40 border-b border-canvas-border/80 bg-canvas/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
                <div>
                  <div className="text-sm font-semibold tracking-tight text-slate-100">
                    Omnibit Index Forge
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Base Sepolia · MVP console · chain 84532
                  </div>
                </div>
                <Nav />
              </div>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
          <Disclaimer />
        </Providers>
      </body>
    </html>
  );
}
