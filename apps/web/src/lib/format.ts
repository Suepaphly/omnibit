import { formatUnits, type Address } from 'viem';

export function shortAddr(a?: Address | string, n = 4): string {
  if (!a) return '—';
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}

export function fmtUnits(value?: bigint, decimals = 18, digits = 6): string {
  if (value === undefined) return '—';
  const s = formatUnits(value, decimals);
  const [i, f = ''] = s.split('.');
  if (!f) return i;
  return `${i}.${f.slice(0, digits).replace(/0+$/, '') || '0'}`.replace(/\.$/, '');
}

export function fmtUsdWad(wad?: bigint, digits = 4): string {
  if (wad === undefined) return '—';
  return `$${fmtUnits(wad, 18, digits)}`;
}

export function bpsOf(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / 10_000n;
}

export function deadlineSeconds(fromNow = 1800): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + fromNow);
}
