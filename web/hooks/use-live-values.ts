"use client";

/** Everything a rule condition can be checked against right now, assembled from the market and portfolio hooks. */
import { useMemo } from "react";
import type { LiveValues } from "@/lib/model/autopilot";
import { useFx, usePools, poolById } from "./use-market";
import { usePortfolio } from "./use-portfolio";

export function useLiveValues(): { live: LiveValues; loading: boolean; anyMock: boolean; fxUpdatedAt: number } {
  const pools = usePools();
  const fx = useFx();
  const pf = usePortfolio();
  const live = useMemo<LiveValues>(() => ({
    rateA: poolById(pools.pools, "A").supplyApy,
    rateB: poolById(pools.pools, "B").supplyApy,
    healthFactor: pf.health.factor,
    hasLoan: pf.health.hasLoan,
    fx: fx.fx.tryPerUsd,
    fxStale: fx.fx.stale,
    idleUsdc: pf.positions.idleUsdc,
    suppliedA: pf.positions.supplied.A,
    suppliedB: pf.positions.supplied.B,
  }), [pools.pools, pf.health, pf.positions, fx.fx]);
  return { live, loading: pools.loading || fx.loading || pf.loading, anyMock: pools.source === "mock" || fx.source === "mock" || pf.source === "mock", fxUpdatedAt: fx.fx.timestamp * 1000 };
}
