'use client';

import { http, createConfig, type CreateConnectorFn } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

const connectors: CreateConnectorFn[] = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: 'Omnibit Index Forge', preference: 'all' }),
];

if (typeof window !== 'undefined' && projectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: 'Omnibit Index Forge',
        description: 'Base Sepolia MVP console',
        url: 'https://omnibit-six.vercel.app',
        icons: [],
      },
    }),
  );
}

export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors,
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

export const walletConnectConfigured = Boolean(projectId);
