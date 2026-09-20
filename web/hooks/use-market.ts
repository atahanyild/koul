"use client";

/** Market reads: pool rates and the USD/TRY price. Live with a fallback to the sample story. */
import { usePoll } from "@/lib/data/store";
import { readFx, readPools } from "@/lib/data/live";
import { MOCK_POOLS, mockFx } from "@/lib/data/mock";
import type { FxPrice, Pool, Source } from "@/lib/data/types";

export interface PoolsState { pools: Pool[]; source: Source; loading: boolean; error: Error | null; updatedAt: number; refresh: () => Promise<void> }

export function usePools(): PoolsState {
  const p = usePoll<Pool[]>("pools", readPools, { intervalMs: 45_000 });
  if (p.data) return { pools: p.data, source: "live", loading: false, error: null, updatedAt: p.updatedAt, refresh: p.refresh };
  // While the first live read is in flight, report loading so pages show skeletons; after a failure, show the story.
  if (p.loading || (!p.error && p.updatedAt === 0)) return { pools: MOCK_POOLS, source: "mock", loading: true, error: null, updatedAt: 0, refresh: p.refresh };
  return { pools: MOCK_POOLS, source: "mock", loading: false, error: p.error, updatedAt: p.updatedAt, refresh: p.refresh };
}

export interface FxState { fx: FxPrice; source: Source; loading: boolean; error: Error | null; refresh: () => Promise<void> }

/** USD/TRY, polled every 10 s so the oracle admin's changes show on stage within seconds. */
export function useFx(): FxState {
  const p = usePoll<FxPrice>("fx", readFx, { intervalMs: 10_000 });
  if (p.data) return { fx: p.data, source: "live", loading: false, error: null, refresh: p.refresh };
  if (p.loading || (!p.error && p.updatedAt === 0)) return { fx: mockFx(), source: "mock", loading: true, error: null, refresh: p.refresh };
  return { fx: mockFx(), source: "mock", loading: false, error: p.error, refresh: p.refresh };
}

export const poolById = (pools: Pool[], id: "A" | "B") => pools.find((p) => p.id === id) ?? MOCK_POOLS[id === "A" ? 0 : 1];
export const bestPool = (pools: Pool[]) => pools.reduce((a, b) => (b.supplyApy > a.supplyApy ? b : a));
export const rateGap = (pools: Pool[]) => Math.abs(poolById(pools, "B").supplyApy - poolById(pools, "A").supplyApy);
