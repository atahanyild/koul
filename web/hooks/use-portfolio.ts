"use client";

/**
 * Positions, health, the position NFT and the router's autopilots for the connected wallet, all read from testnet.
 */
import { usePasskeyWallet } from "@sembol/passkey-react";
import type { PositionNft } from "@koul/core";
import { usePoll } from "@/lib/data/store";
import { readChainAutopilots, readWalletPortfolio, type ChainAutopilot } from "@/lib/data/live";
import type { Health, Positions } from "@/lib/data/types";
import { useWallet } from "./use-wallet";

export interface ChainAutopilotsState { list: ChainAutopilot[]; loading: boolean; error: Error | null; refresh: () => Promise<void> }

/** Every autopilot the router holds for this wallet. Empty until the first read lands. */
export function useChainAutopilots(): ChainAutopilotsState {
  const { address, isConnected, txEpoch } = usePasskeyWallet();
  const p = usePoll<ChainAutopilot[]>(isConnected && address ? `autopilots:${address}` : null, () => readChainAutopilots(address!), { intervalMs: 30_000, enabled: isConnected, deps: [txEpoch] });
  const loading = isConnected && p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
  return { list: isConnected ? p.data ?? [] : [], loading, error: p.error, refresh: p.refresh };
}

export interface PortfolioState {
  positions: Positions;
  health: Health;
  nft: PositionNft | null;
  /** XOXNO account id from the position NFT, null when the wallet has never supplied. */
  accountId: bigint | null;
  /** True once a read has succeeded for this wallet. */
  loaded: boolean;
  loading: boolean;
  error: Error | null;
  connected: boolean;
  /** True when the connected wallet holds nothing: no position and no idle USDC. */
  empty: boolean;
  refresh: () => Promise<void>;
}

export const EMPTY_POSITIONS: Positions = { idleUsdc: 0, idleXlm: 0, supplied: { A: 0, B: 0 }, borrowed: { A: 0, B: 0 }, accountId: null };
export const EMPTY_HEALTH: Health = { factor: null, hasLoan: false, minimum: 1.25, liquidationAt: 1 };

export function usePortfolio(): PortfolioState {
  const w = useWallet();
  const key = w.isConnected && w.address ? `portfolio:${w.address}` : null;
  const p = usePoll(key, () => readWalletPortfolio(w.address!), { intervalMs: 30_000, enabled: w.isConnected, deps: [w.txEpoch] });
  if (!w.isConnected) {
    return { positions: EMPTY_POSITIONS, health: EMPTY_HEALTH, nft: null, accountId: null, loaded: false, loading: w.initializing, error: null, connected: false, empty: false, refresh: p.refresh };
  }
  if (p.data) {
    const { positions, health, nft } = p.data;
    const hasPosition = positions.supplied.A + positions.supplied.B + positions.borrowed.A + positions.borrowed.B > 0;
    return { positions, health, nft, accountId: positions.accountId === null ? null : BigInt(positions.accountId), loaded: true, loading: false, error: p.error, connected: true, empty: !hasPosition && positions.idleUsdc === 0, refresh: p.refresh };
  }
  const loading = p.loading || (!p.error && p.updatedAt === 0);
  return { positions: EMPTY_POSITIONS, health: EMPTY_HEALTH, nft: null, accountId: null, loaded: false, loading, error: p.error, connected: true, empty: false, refresh: p.refresh };
}
