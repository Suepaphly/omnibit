'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from 'wagmi';
import {
  parseUnits,
  parseEventLogs,
  type Address,
} from 'viem';

import {
  Panel,
  Field,
  inputClass,
  btnPrimary,
  btnSecondary,
  Stat,
} from '@/components/Panel';
import { PageHeader } from '@/components/PageHeader';
import { TxGate } from '@/components/TxGate';
import { TxStatus } from '@/components/TxStatus';
import { StepsGuide } from '@/components/StepsGuide';
import { addresses } from '@/config/addresses';
import { IndexLauncherAbi, erc20Abi } from '@/abi';
import { deadlineSeconds, shortAddr } from '@/lib/format';

export default function LaunchPage() {
  const { address } = useAccount();

  // User-configurable new index
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [backingUsdc, setBackingUsdc] = useState('2');
  const [lpUsdc, setLpUsdc] = useState('1');

  // IMPORTANT:
  // Do NOT initialize this from addresses.ai2.
  // It should only become populated after a successful createSeed.
  const [newIndexAddress, setNewIndexAddress] = useState<Address | undefined>(
    undefined
  );

  const [showAddrs, setShowAddrs] = useState(false);

  const tNVDA = addresses.tNVDA;
  const tMSFT = addresses.tMSFT;
  const launcher = addresses.launcher;
  const usdc = addresses.usdc;

  /*
   * --------------------------------------------------------------------------
   * READS
   * --------------------------------------------------------------------------
   */

  const { data: allowance } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && launcher ? [address, launcher] : undefined,
    query: {
      enabled: Boolean(address && launcher),
    },
  });

  /*
   * --------------------------------------------------------------------------
   * TRANSACTION STATE
   * --------------------------------------------------------------------------
   */

  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({
    hash,
  });

  /*
   * --------------------------------------------------------------------------
   * PARSE NEW INDEX ADDRESS FROM createSeed RECEIPT
   * --------------------------------------------------------------------------
   *
   * IndexLauncher.createSeed emits IndexSeeded.
   * Once that transaction confirms, extract the index address and make it
   * the active index for the rest of this launch flow.
   */

  useEffect(() => {
    if (!receipt) return;

    try {
      const events = parseEventLogs({
        abi: IndexLauncherAbi,
        logs: receipt.logs,
        eventName: 'IndexSeeded',
      });

      const created = events[0]?.args?.index as Address | undefined;

      if (created) {
        setNewIndexAddress(created);
      }
    } catch {
      // Other transactions on this page do not emit IndexSeeded.
      // Do nothing.
    }
  }, [receipt]);

  /*
   * --------------------------------------------------------------------------
   * AMOUNTS
   * --------------------------------------------------------------------------
   */

  const backing = useMemo(() => {
    try {
      return parseUnits(backingUsdc || '0', 6);
    } catch {
      return 0n;
    }
  }, [backingUsdc]);

  const lp = useMemo(() => {
    try {
      return parseUnits(lpUsdc || '0', 6);
    } catch {
      return 0n;
    }
  }, [lpUsdc]);

  /*
   * --------------------------------------------------------------------------
   * INDEX PARAMETERS
   * --------------------------------------------------------------------------
   *
   * MVP basket remains the validated tNVDA / tMSFT 50/50 basket.
   * Name and symbol are user-selected.
   */

  const indexParams = useMemo(() => {
    if (!tNVDA || !tMSFT || !address) return undefined;

    return {
      name,
      symbol,
      constituents: [tNVDA, tMSFT] as Address[],
      initialWeightsBps: [5000, 5000],
      creator: address,
    };
  }, [name, symbol, tNVDA, tMSFT, address]);

  /*
   * --------------------------------------------------------------------------
   * STEP 1A — APPROVE USDC
   * --------------------------------------------------------------------------
   */

  function approveUsdc() {
    if (!launcher) return;

    reset();

    writeContract({
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, backing + lp],
    });
  }

  /*
   * --------------------------------------------------------------------------
   * STEP 1B — CREATE + SEED NEW INDEX
   * --------------------------------------------------------------------------
   */

  function createSeed() {
    if (!launcher || !indexParams) return;

    if (!name.trim()) {
      window.alert('Enter an index name.');
      return;
    }

    if (!symbol.trim()) {
      window.alert('Enter an index symbol.');
      return;
    }

    // Clear any previous result.
    // The address shown after this must come from THIS transaction.
    setNewIndexAddress(undefined);

    reset();

    writeContract({
      address: launcher,
      abi: IndexLauncherAbi,
      functionName: 'createSeed',
      args: [
        {
          name: indexParams.name,
          symbol: indexParams.symbol,
          constituents: indexParams.constituents,
          initialWeightsBps: indexParams.initialWeightsBps,
          creator: indexParams.creator,
        },
        backing,
        backing,
        [0n, 0n],
        deadlineSeconds(),
      ],
    });
  }

  /*
   * --------------------------------------------------------------------------
   * STEP 2A — APPROVE NEW INDEX SHARES FOR LP
   * --------------------------------------------------------------------------
   */

  function approveShares() {
    if (!launcher || !newIndexAddress) return;

    reset();

    // INDEX = 18 decimals, USDC = 6 decimals
    const indexAmount = lp * 10n ** 12n;

    writeContract({
      address: newIndexAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [launcher, indexAmount],
    });
  }

  /*
   * --------------------------------------------------------------------------
   * STEP 2B — INITIALIZE NEW INDEX/USDC MARKET
   * --------------------------------------------------------------------------
   */

  function openMarket() {
    if (!launcher || !newIndexAddress) return;

    reset();

    writeContract({
      address: launcher,
      abi: IndexLauncherAbi,
      functionName: 'initializeMarket',
      args: [
        newIndexAddress,
        lp,
        lp,
        deadlineSeconds(),
      ],
    });
  }

  /*
   * --------------------------------------------------------------------------
   * COPY ADDRESS
   * --------------------------------------------------------------------------
   */

  async function copyIndexAddress() {
    if (!newIndexAddress) return;

    await navigator.clipboard.writeText(newIndexAddress);
  }

  /*
   * --------------------------------------------------------------------------
   * ADD NEW INDEX TOKEN TO METAMASK
   * --------------------------------------------------------------------------
   */

  async function addIndexToWallet() {
    if (!newIndexAddress) return;

    const ethereum = (
      window as typeof window & {
        ethereum?: {
          request: (args: {
            method: string;
            params?: unknown;
          }) => Promise<unknown>;
        };
      }
    ).ethereum;

    if (!ethereum) {
      window.alert('No injected wallet was detected.');
      return;
    }

    try {
      await ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: newIndexAddress,
            symbol: symbol.trim(),
            decimals: 18,
          },
        },
      });
    } catch (walletError) {
      console.error('Unable to add token to wallet:', walletError);
    }
  }

  /*
   * --------------------------------------------------------------------------
   * UI
   * --------------------------------------------------------------------------
   */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Launch"
        subtitle="Create a new fully backed index, seed its basket, then initialize its Index/USDC Uniswap V4 market."
      />

      <StepsGuide
        title="How to use this page"
        defaultOpen
        steps={[
          {
            title: '1a Approve USDC',
            body: 'Allow the launcher to pull the USDC required for the basket seed and initial pool liquidity.',
          },
          {
            title: '1b Create Index and Seed',
            body: 'Deploys a brand-new index token, buys tNVDA + tMSFT, seeds the vault, and returns the new index contract address.',
          },
          {
            title: '2a Approve shares for LP',
            body: 'Approve the newly created index shares so the launcher can pair them with USDC.',
          },
          {
            title: '2b Open market',
            body: 'Creates the new Index/USDC Uniswap V4 pool with the protocol fee hook and seeds initial liquidity.',
          },
        ]}
      />

      <Panel
        title="Bootstrap an index"
        subtitle="Base Sepolia MVP uses the validated 50/50 tNVDA + tMSFT reference basket."
      >
        <button
          type="button"
          className="mb-4 text-xs font-medium text-accent-soft underline-offset-2 hover:underline"
          onClick={() => setShowAddrs((v) => !v)}
        >
          {showAddrs ? 'Hide contract addresses' : 'Show contract addresses'}
        </button>

        {showAddrs && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat
              label="Launcher"
              value={shortAddr(launcher)}
            />
            <Stat
              label="tNVDA"
              value={shortAddr(tNVDA)}
            />
            <Stat
              label="tMSFT"
              value={shortAddr(tMSFT)}
            />
          </div>
        )}

        <TxGate
          require={['launcher', 'tNVDA', 'tMSFT', 'usdc']}
          actionLabel="launch"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Index name">
              <input
                className={inputClass}
                value={name}
                placeholder="e.g. Index Tech2"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Symbol">
              <input
                className={inputClass}
                value={symbol}
                placeholder="e.g. TECH2"
                onChange={(e) => setSymbol(e.target.value)}
              />
            </Field>

            <Field
              label="USDC for basket seed"
              help="Spent in step 1b to acquire tNVDA and tMSFT backing."
            >
              <input
                className={inputClass}
                value={backingUsdc}
                onChange={(e) => setBackingUsdc(e.target.value)}
              />
            </Field>

            <Field
              label="USDC for pool liquidity"
              help="Paired with newly created index shares when the V4 market opens."
            >
              <input
                className={inputClass}
                value={lpUsdc}
                onChange={(e) => setLpUsdc(e.target.value)}
              />
            </Field>

            <Field
              label="New index address"
              help="This is populated automatically after Create Index and Seed confirms."
            >
              <input
                className={inputClass}
                value={newIndexAddress ?? ''}
                placeholder="Waiting for new index creation..."
                readOnly
              />
            </Field>

            <div className="flex flex-col justify-end gap-2">
              <p className="text-xs text-slate-500">
                USDC approved for launcher:{' '}
                <span className="font-mono">
                  {allowance?.toString() ?? '—'}
                </span>
              </p>

              {!newIndexAddress && (
                <p className="text-xs text-slate-500">
                  No index has been created in this launch session yet.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={isPending}
              onClick={approveUsdc}
            >
              1a Approve USDC
            </button>

            <button
              type="button"
              className={btnPrimary}
              disabled={
                isPending ||
                !address ||
                !name.trim() ||
                !symbol.trim()
              }
              onClick={createSeed}
            >
              1b Create Index and Seed
            </button>

            <button
              type="button"
              className={btnSecondary}
              disabled={isPending || !newIndexAddress}
              onClick={approveShares}
            >
              2a Approve shares for LP
            </button>

            <button
              type="button"
              className={btnPrimary}
              disabled={isPending || !newIndexAddress}
              onClick={openMarket}
            >
              2b Open market
            </button>
          </div>

          <TxStatus
            hash={hash}
            isPending={isPending}
            isConfirming={isConfirming}
            isSuccess={isSuccess}
            error={error}
          />

          {newIndexAddress && (
            <div className="mt-5 rounded-lg border border-canvas-border bg-canvas/60 p-4 text-left">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    Index created successfully
                  </p>

                  <p className="mt-1 text-lg font-semibold text-white">
                    {name}
                    {symbol && (
                      <span className="ml-2 text-sm text-slate-400">
                        ({symbol})
                      </span>
                    )}
                  </p>
                </div>

                <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Created on Base Sepolia
                </div>
              </div>

              <p className="mt-4 text-xs uppercase tracking-wide text-slate-500">
                Index token contract
              </p>

              <p className="mt-1 break-all font-mono text-sm text-sky-300">
                {newIndexAddress}
              </p>

              <p className="mt-2 text-xs text-slate-500">
                ERC-20 index share · 18 decimals
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={copyIndexAddress}
                >
                  Copy address
                </button>

                <button
                  type="button"
                  className={btnPrimary}
                  onClick={addIndexToWallet}
                >
                  Add {symbol || 'index'} to MetaMask
                </button>

                <a
                  href={`https://sepolia.basescan.org/address/${newIndexAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className={btnSecondary}
                >
                  View on BaseScan
                </a>
              </div>

              <div className="mt-4 rounded-md border border-canvas-border/70 bg-black/10 p-3">
                <p className="text-xs text-slate-400">
                  This newly created address will now automatically be used by
                  <span className="font-medium text-slate-300">
                    {' '}2a Approve shares for LP
                  </span>
                  {' '}and
                  <span className="font-medium text-slate-300">
                    {' '}2b Open market
                  </span>
                  .
                </p>
              </div>
            </div>
          )}
        </TxGate>
      </Panel>
    </div>
  );
}