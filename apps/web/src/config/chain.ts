import { baseSepolia } from 'viem/chains';

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
export const omnibitChain = baseSepolia;

if (omnibitChain.id !== 84532) {
  // Defensive — wagmi config always pins Base Sepolia.
  console.warn('Expected Base Sepolia 84532');
}
