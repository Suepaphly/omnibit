import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Nav } from '@/components/Nav';
import { ConnectButton } from '@/components/ConnectButton';
import { BrandLockup } from '@/components/Logo';
import { Footer } from '@/components/Footer';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Omnibit Index Forge',
    template: '%s · Omnibit Index Forge',
  },
  description:
    'Fully backed index shares that accrete without dilution. Base Sepolia testnet console for Omnibit Index Forge.',
  applicationName: 'Omnibit Index Forge',
  keywords: ['Omnibit', 'Index Forge', 'Base Sepolia', 'DeFi', 'index', 'accretion'],
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    title: 'Omnibit Index Forge',
    description: 'Fully backed index shares that accrete without dilution.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <Providers>
          <header className="sticky top-0 z-40 border-b border-canvas-border/70 bg-canvas/75 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-4 sm:gap-8">
                <BrandLockup />
                <Nav />
              </div>
              <ConnectButton />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
