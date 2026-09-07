'use client';

import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? '';

const connectors = [
  injected({ shimDisconnect: true }),
  coinbaseWallet({ appName: 'Omnibit Index Forge', preference: 'all' }),
];

if (typeof window !== 'undefined' && projectId) {
  connectors.push(
    walletConnect({
      projectId,
      metadata: {
        name: 'Omnibit Index Forge',
        description: 'Base Sepolia MVP console',
        url: 'https://omnibit-six.vercel.app',
        icons: [],
      },
      showQrModal: true,
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
