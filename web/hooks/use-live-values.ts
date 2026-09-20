"use client";

/** Everything a rule condition can be checked against right now, assembled from the market and portfolio hooks. */
import { useMemo } from "react";
import type { LiveValues } from "@/lib/model/autopilot";
import { useFx, usePools, poolById } from "./use-market";
import { usePortfolio } from "./use-portfolio";

export function useLiveValues(): { live: LiveValues; loading: boolean; fxUpdatedAt: number } {
  const pools = usePools();
  const fx = useFx();
  const pf = usePortfolio();
  const live = useMemo<LiveValues>(() => ({
    // The router compares the pool's raw annualised rates, so rules are evaluated against APR, not the compounded APY.
    rateA: poolById(pools.pools, "A")?.supplyApr ?? null,
    rateB: poolById(pools.pools, "B")?.supplyApr ?? null,
    healthFactor: pf.health.factor,
    hasLoan: pf.health.hasLoan,
    fx: fx.loading ? null : fx.fx.tryPerUsd,
    fxStale: fx.fx.stale,
    idleUsdc: pf.positions ? pf.positions.idleUsdc : null,
    suppliedA: pf.positions ? pf.positions.supplied.A : null,
    suppliedB: pf.positions ? pf.positions.supplied.B : null,
  }), [pools.pools, pf.health, pf.positions, fx.fx, fx.loading]);
  return { live, loading: pools.loading || fx.loading || pf.loading, fxUpdatedAt: fx.fx.timestamp * 1000 };
}
