import type { ReactNode } from 'react';
import { AppSubnav } from '@/components/AppSubnav';

export const metadata = {
  title: 'App',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <AppSubnav />
      {children}
    </div>
  );
}
