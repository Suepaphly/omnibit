import { type Address, isAddress, zeroAddress } from 'viem';

function readAddr(key: string): Address | undefined {
  const v = process.env[key];
  if (!v || v.trim() === '') return undefined;
  if (!isAddress(v)) return undefined;
  if (v.toLowerCase() === zeroAddress) return undefined;
  return v as Address;
}

function readBytes32(key: string): `0x${string}` | undefined {
  const v = process.env[key];
  if (!v || !/^0x[0-9a-fA-F]{64}$/.test(v)) return undefined;
  return v as `0x${string}`;
}

/** Known Base Sepolia constants + env-driven protocol addresses. */
export const addresses = {
  usdc: (readAddr('NEXT_PUBLIC_USDC_ADDRESS') ??
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address,
  factory: readAddr('NEXT_PUBLIC_INDEX_FACTORY'),
  launcher: readAddr('NEXT_PUBLIC_INDEX_LAUNCHER'),
  hook: readAddr('NEXT_PUBLIC_INDEX_FEE_HOOK'),
  zap: readAddr('NEXT_PUBLIC_INDEX_ZAP_ROUTER'),
  adapter: readAddr('NEXT_PUBLIC_SWAP_ADAPTER'),
  treasury: readAddr('NEXT_PUBLIC_PROTOCOL_TREASURY'),
  ai2: readAddr('NEXT_PUBLIC_AI2_INDEX'),
  engine: readAddr('NEXT_PUBLIC_AI2_ENGINE'),
  poolId: readBytes32('NEXT_PUBLIC_AI2_POOL_ID'),
  tNVDA: readAddr('NEXT_PUBLIC_TNVDA'),
  tMSFT: readAddr('NEXT_PUBLIC_TMSFT'),
  poolManager: (readAddr('NEXT_PUBLIC_V4_POOL_MANAGER') ??
    '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408') as Address,
  universalRouter: (readAddr('NEXT_PUBLIC_V4_UNIVERSAL_ROUTER') ??
    '0x492e6456d9528771018deb9e87ef7750ef184104') as Address,
  stateView: (readAddr('NEXT_PUBLIC_V4_STATE_VIEW') ??
    '0x571291b572ed32ce6751a2cb2486ebee8defb9b4') as Address,
  quoter: (readAddr('NEXT_PUBLIC_V4_QUOTER') ??
    '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba') as Address,
} as const;

export function missingLabel(keys: (keyof typeof addresses)[]): string[] {
  return keys.filter((k) => {
    const v = addresses[k];
    return v === undefined || v === null;
  });
}

export function hasAddress(v: Address | undefined): v is Address {
  return typeof v === 'string' && isAddress(v) && v.toLowerCase() !== zeroAddress;
}
