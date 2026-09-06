import type { ReactNode } from 'react';
import { AppSubnav } from '@/components/AppSubnav';
import { WrongNetworkBanner } from '@/components/NetworkBadge';

export const metadata = {
  title: 'App',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-0">
      <WrongNetworkBanner />
      <AppSubnav />
      {children}
    </div>
  );
}
