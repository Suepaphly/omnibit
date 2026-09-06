import type { ReactNode } from 'react';
import { NetworkBadge } from '@/components/NetworkBadge';

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.65rem]">
            {title}
          </h1>
          {badge ?? <NetworkBadge />}
        </div>
        {subtitle && <p className="max-w-2xl text-sm leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
