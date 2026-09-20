"use client";

/** Market reads: pool rates and the USD/TRY price, polled from testnet. */
import { usePoll } from "@/lib/data/store";
import { readFx, readMarkets, readPools, type MarketReading } from "@/lib/data/live";
import type { FxPrice, Pool } from "@/lib/data/types";
import { MAX_PRICE_AGE_SECS } from "@/lib/koul";

export interface PoolsState { pools: Pool[]; loading: boolean; error: Error | null; updatedAt: number; refresh: () => Promise<void> }

export function usePools(): PoolsState {
  const p = usePoll<Pool[]>("pools", readPools, { intervalMs: 45_000 });
  const loading = p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
  return { pools: p.data ?? [], loading, error: p.error, updatedAt: p.updatedAt, refresh: p.refresh };
}

export interface MarketsState { markets: MarketReading[]; loading: boolean; error: Error | null; updatedAt: number; refresh: () => Promise<void> }

/** Every XOXNO testnet market with live rates. */
export function useMarkets(): MarketsState {
  const p = usePoll<MarketReading[]>("markets", readMarkets, { intervalMs: 45_000 });
  const loading = p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
  return { markets: p.data ?? [], loading, error: p.error, updatedAt: p.updatedAt, refresh: p.refresh };
}

/** What the fx hook reports before the first read lands: no rate, marked stale so nothing quotes against it. */
export const NO_FX: FxPrice = { tryPerUsd: 0, timestamp: 0, ageSec: 0, stale: true, maxAgeSec: MAX_PRICE_AGE_SECS };

export interface FxState { fx: FxPrice; loading: boolean; error: Error | null; refresh: () => Promise<void> }

/** USD/TRY, polled every 10 s so the oracle admin's changes show on stage within seconds. */
export function useFx(): FxState {
  const p = usePoll<FxPrice>("fx", readFx, { intervalMs: 10_000 });
  const loading = p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
  return { fx: p.data ?? NO_FX, loading, error: p.error, refresh: p.refresh };
}

export const poolById = (pools: Pool[], id: "A" | "B") => pools.find((p) => p.id === id) ?? null;
export const bestPool = (pools: Pool[]): Pool | null => (pools.length ? pools.reduce((a, b) => (b.supplyApy > a.supplyApy ? b : a)) : null);
export const rateGap = (pools: Pool[]) => {
  const a = poolById(pools, "A");
  const b = poolById(pools, "B");
  return a && b ? Math.abs(b.supplyApy - a.supplyApy) : 0;
};
