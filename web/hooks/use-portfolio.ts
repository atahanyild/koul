"use client";

/**
 * Positions, health and the router's stored rules for the connected wallet. Live when the chain has something for
 * this wallet, the sample story in demo mode otherwise, true empties when demo mode is off.
 */
import { usePasskeyWallet } from "@sembol/passkey-react";
import { usePoll } from "@/lib/data/store";
import { readPositions, readRouterRules } from "@/lib/data/live";
import { MOCK_HEALTH, MOCK_POSITIONS } from "@/lib/data/mock";
import type { Health, Positions, Source } from "@/lib/data/types";
import type { RouterRules } from "@/lib/model/autopilot";
import { useDemoMode } from "./use-demo-mode";
import { useWallet } from "./use-wallet";

export interface RouterRulesState { rules: RouterRules | null | undefined; loading: boolean; error: Error | null; refresh: () => Promise<void> }

/** The fixed rule struct the deployed router holds for this wallet. `null` = none saved, `undefined` = not read yet. */
export function useRouterRules(): RouterRulesState {
  const { address, isConnected, txEpoch } = usePasskeyWallet();
  const p = usePoll<RouterRules | null>(isConnected && address ? `rules:${address}` : null, () => readRouterRules(address!), { intervalMs: 30_000, enabled: isConnected, deps: [txEpoch] });
  return { rules: isConnected ? p.data : null, loading: isConnected && p.loading, error: p.error, refresh: p.refresh };
}

export interface PortfolioState {
  positions: Positions;
  health: Health;
  source: Source;
  loading: boolean;
  error: Error | null;
  connected: boolean;
  /** True when the connected wallet has no position and demo mode is off. */
  empty: boolean;
  refresh: () => Promise<void>;
}

const EMPTY_POSITIONS: Positions = { idleUsdc: 0, idleXlm: 0, supplied: { A: 0, B: 0 }, borrowed: { A: 0, B: 0 }, accountId: null };
const EMPTY_HEALTH: Health = { factor: null, hasLoan: false, minimum: 1.25, liquidationAt: 1 };

export function usePortfolio(): PortfolioState {
  const w = useWallet();
  const [demo] = useDemoMode();
  const rr = useRouterRules();
  const accountId = rr.rules?.account_id ?? null;
  const key = w.isConnected && w.address ? `positions:${w.address}:${accountId ?? "none"}` : null;
  const p = usePoll(key, () => readPositions(w.address!, accountId, w.kit), { intervalMs: 30_000, enabled: w.isConnected && rr.rules !== undefined, deps: [w.txEpoch] });

  if (!w.isConnected) {
    return { positions: demo ? MOCK_POSITIONS : EMPTY_POSITIONS, health: demo ? MOCK_HEALTH : EMPTY_HEALTH, source: "mock", loading: w.initializing, error: null, connected: false, empty: !demo, refresh: p.refresh };
  }
  if (p.data) {
    const live = p.data;
    const hasPosition = live.accountId !== null && (live.supplied.A + live.supplied.B + live.borrowed.A + live.borrowed.B > 0);
    if (hasPosition || !demo) {
      // Live balances always win; in demo mode without a position we keep the wallet's real idle balances too.
      return { positions: live, health: live.health, source: "live", loading: false, error: null, connected: true, empty: !hasPosition && live.idleUsdc === 0, refresh: p.refresh };
    }
    return { positions: { ...MOCK_POSITIONS, idleUsdc: live.idleUsdc || MOCK_POSITIONS.idleUsdc, idleXlm: live.idleXlm || MOCK_POSITIONS.idleXlm }, health: MOCK_HEALTH, source: "mock", loading: false, error: null, connected: true, empty: false, refresh: p.refresh };
  }
  const loading = rr.loading || p.loading || (!p.error && p.updatedAt === 0);
  if (loading) return { positions: demo ? MOCK_POSITIONS : EMPTY_POSITIONS, health: demo ? MOCK_HEALTH : EMPTY_HEALTH, source: "mock", loading: true, error: null, connected: true, empty: false, refresh: p.refresh };
  return { positions: demo ? MOCK_POSITIONS : EMPTY_POSITIONS, health: demo ? MOCK_HEALTH : EMPTY_HEALTH, source: "mock", loading: false, error: p.error, connected: true, empty: !demo, refresh: p.refresh };
}
