'use client';

import Link from 'next/link';
import { useAccount, useChainId } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { Panel, Stat } from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { Checklist, StepsGuide } from '@/components/StepsGuide';
import { HelpTip } from '@/components/HelpTip';
import { addresses, hasAddress } from '@/config/addresses';
import { shortAddr } from '@/lib/format';
import { useState } from 'react';

const screens = [
  {
    href: '/app/launch',
    title: 'Launch an index',
    desc: 'Create a new index, seed its basket, and open the trading pool.',
    tip: 'Two transactions: createSeed (factory + basket) then initializeMarket (hook + V4 pool + LP).',
    tone: 'accent' as const,
  },
  {
    href: '/app/vault',
    title: 'View the vault',
    desc: 'See share supply, basket holdings, and value that has accrued.',
    tip: 'Tracked balances are recognized holdings; raw is the on-chain ERC-20 balance. UsdWad is display/NAV only.',
    tone: 'accent' as const,
  },
  {
    href: '/app/mint',
    title: 'Mint shares',
    desc: 'Deposit basket assets — or pay with USDC — to receive index shares.',
    tip: 'In-kind uses mintExactShares; Zap buys constituents with USDC via IndexZapRouter.',
    tone: 'accent' as const,
  },
  {
    href: '/app/trade',
    title: 'Trade on the pool',
    desc: 'Buy or sell index shares against USDC on the canonical pool.',
    tip: 'LP fee stays with liquidity providers; protocol hook fee accrues as pendingHookUsdc.',
    tone: 'accent' as const,
  },
  {
    href: '/app/accretion',
    title: 'Grow the index',
    desc: 'Move protocol fees into the vault so existing shares become more valuable.',
    tip: 'sweepFees then harvest — no new shares minted (non-dilutive accretion).',
    tone: 'accretion' as const,
  },
  {
    href: '/app/redeem',
    title: 'Redeem shares',
    desc: 'Burn shares and receive your pro-rata slice of the basket.',
    tip: 'In-kind redeem: share fee, burn, floor pro-rata constituents. No oracle or DEX.',
    tone: 'accent' as const,
  },
];

const CORE = [
  { key: 'factory', label: 'Factory', addr: () => addresses.factory },
  { key: 'launcher', label: 'Launcher', addr: () => addresses.launcher },
  { key: 'hook', label: 'Fee hook', addr: () => addresses.hook },
  { key: 'zap', label: 'Zap router', addr: () => addresses.zap },
  { key: 'ai2', label: 'AI2 index', addr: () => addresses.ai2 },
  { key: 'engine', label: 'Accretion engine', addr: () => addresses.engine },
] as const;

export default function AppOverviewPage() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const onSepolia = isConnected && chainId === baseSepolia.id;
  const [showAddresses, setShowAddresses] = useState(false);

  const configured = CORE.map((c) => ({ ...c, address: c.addr() }));
  const ready = configured.filter((c) => hasAddress(c.address)).length;
  const allReady = ready === configured.length;
  const noneReady = ready === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Console"
        subtitle="Test Omnibit Index Forge on Base Sepolia. Connect your wallet, wire contract addresses after deploy, then walk through launch → mint → trade → accretion."
      />

      <Checklist
        title="What to do next"
        items={[
          {
            label: 'Connect your wallet',
            done: isConnected,
            hint: 'Use the buttons in the header. You’ll be prompted for Base Sepolia.',
          },
          {
            label: 'Switch to Base Sepolia (84532)',
            done: onSepolia,
            hint: !isConnected
              ? 'Connect first, then switch if needed.'
              : 'Use the banner or “Switch to Base Sepolia” if you’re on another network.',
          },
          {
            label: 'Deploy contracts & add addresses to env',
            done: allReady,
            hint: noneReady
              ? 'Deploy on Base Sepolia, set NEXT_PUBLIC_* in Vercel (or .env.local), then redeploy this app.'
              : `${ready} of ${configured.length} core addresses set — finish the rest in env and redeploy.`,
          },
          {
            label: 'Launch (or load) an index',
            done: hasAddress(addresses.ai2),
            hint: 'Open Launch to create a seed, or set NEXT_PUBLIC_AI2_INDEX if you already deployed one.',
          },
          {
            label: 'Mint, trade, accrete, redeem',
            done: false,
            hint: 'Use the flow cards below once the index address is configured.',
          },
        ]}
      />

      {/* Deployment status — friendly empty vs compact when ready */}
      {noneReady ? (
        <section className="rounded-2xl border border-dashed border-canvas-border-strong bg-canvas-raised/40 px-5 py-8 text-center sm:px-8">
          <p className="text-lg font-semibold text-slate-100">Contracts not deployed yet</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">
            This console needs protocol addresses from a Base Sepolia deploy. Until then, pages stay
            read-only and transactions stay gated — nothing is broken.
          </p>
          <ol className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm text-slate-300">
            <li className="flex gap-2">
              <span className="font-semibold text-accent-soft">1.</span>
              Deploy the forge contracts on <strong>Base Sepolia</strong>.
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-accent-soft">2.</span>
              Copy addresses into <code className="rounded bg-canvas/80 px-1 font-mono text-xs">NEXT_PUBLIC_*</code>{' '}
              (Vercel env or <code className="font-mono text-xs">.env.local</code>).
            </li>
            <li className="flex gap-2">
              <span className="font-semibold text-accent-soft">3.</span>
              Redeploy / restart the web app, then refresh this page.
            </li>
          </ol>
          <p className="mt-5 text-xs text-slate-500">
            See <code className="font-mono">.env.example</code> for the full list of keys.
          </p>
        </section>
      ) : (
        <Panel
          title="Deployment status"
          subtitle={
            allReady
              ? 'All core addresses are configured.'
              : `${ready} of ${configured.length} core addresses configured — finish the rest in env.`
          }
          actions={
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                allReady ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent-soft'
              }`}
            >
              {allReady ? 'Ready' : 'Partial'}
            </span>
          }
        >
          <button
            type="button"
            className="text-xs font-medium text-accent-soft underline-offset-2 hover:underline"
            onClick={() => setShowAddresses((v) => !v)}
          >
            {showAddresses ? 'Hide addresses' : 'Show contract addresses'}
          </button>
          {showAddresses && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {configured.map((c) => (
                <Stat
                  key={c.key}
                  label={c.label}
                  value={hasAddress(c.address) ? shortAddr(c.address) : 'unset'}
                  hint={hasAddress(c.address) ? undefined : 'set NEXT_PUBLIC_*'}
                  tone={hasAddress(c.address) ? 'ok' : 'warn'}
                />
              ))}
            </div>
          )}
        </Panel>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Flows</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {screens.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group rounded-2xl border border-canvas-border/80 bg-canvas-raised/50 p-5 transition hover:border-accent/40 hover:bg-canvas-raised hover:shadow-glow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-100 group-hover:text-white">{s.title}</div>
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    s.tone === 'accretion' ? 'bg-accretion shadow-accretion-glow' : 'bg-accent shadow-glow-sm'
                  }`}
                />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              <p className="mt-3 flex items-center text-[11px] text-slate-500">
                Technical detail
                <HelpTip side="bottom">{s.tip}</HelpTip>
              </p>
            </Link>
          ))}
        </div>
      </div>

      <StepsGuide
        title="How to use this console"
        defaultOpen={noneReady}
        steps={[
          {
            title: 'Connect on Base Sepolia',
            body: 'Header connect buttons target Base Sepolia (84532). Switch if the yellow banner appears.',
          },
          {
            title: 'Wire addresses after deploy',
            body: 'Until NEXT_PUBLIC_* addresses are set, forms stay gated. That empty state above is expected.',
          },
          {
            title: 'Follow the flows in order',
            body: 'Launch → Vault (inspect) → Mint → Trade → Accretion → Redeem. Each page has its own step guide.',
          },
        ]}
      />
    </div>
  );
}
