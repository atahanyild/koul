"use client";

/**
 * "What you have": the numbers a rule is written against, live, on the page where the rule is written. The idle
 * wallet, each hub with its rate, debt and free cash, loan health, USD/TRY with the gap between the hubs, and how
 * long Koul's key lasts. Each cell names the condition that reads it, so the picker and the number line up.
 */
import { Label, Sk, Tile, TileLabel } from "@/components/signal";
import { Rolling } from "@/components/signal/rolling";
import type { Pool, Positions, Health } from "@/lib/data/types";
import { fmtFx, fmtHealth, fmtPct, fmtUsdc } from "@/lib/format";
import { POOLS, type PoolId } from "@/lib/model/autopilot";
import { cn } from "@/lib/utils";

function Cell({ label, value, sub, tone = "text", reads }: { label: string; value: string; sub?: string; tone?: "text" | "lime" | "danger" | "dim"; /** The condition in the picker that reads this number. */ reads?: string }) {
  const t = { text: "text-text", lime: "text-accent-text", danger: "text-danger", dim: "text-dim" }[tone];
  return (
    <div className="grid content-start gap-1.5 py-1">
      <Label>{label}</Label>
      <div className={cn("mono num text-[22px] font-bold leading-none md:text-[24px]", t)}><Rolling text={value} /></div>
      {sub && <Label tone="dim" className="normal-case">{sub}</Label>}
      {reads && <Label tone="lime">reads as {reads}</Label>}
    </div>
  );
}

export function Holdings({ positions, health, pools, fx, xlm, access, loading, className }: {
  positions: Positions;
  health: Health;
  pools: Pool[];
  fx: { tryPerUsd: number | null; stale: boolean };
  xlm: number | null;
  access: { active: boolean; daysLeft: number | null; loaded: boolean };
  loading: boolean;
  className?: string;
}) {
  const hub = (id: PoolId) => {
    const pool = pools.find((p) => p.id === id) ?? null;
    const supplied = positions.supplied[id];
    const debt = positions.borrowed[id];
    const parts = [pool ? `${fmtPct(pool.supplyApy)} APY` : "rate loading", debt > 0 ? `debt ${fmtUsdc(debt)}` : null, pool ? `${fmtUsdc(pool.availableUsdc)} free in the hub` : null].filter(Boolean);
    return { supplied, sub: parts.join(" · "), pool };
  };
  const a = hub("A");
  const b = hub("B");
  const gap = a.pool && b.pool ? Math.abs(b.pool.supplyApr - a.pool.supplyApr) : null;
  const healthTone = !health.hasLoan ? "dim" : health.factor !== null && health.factor < health.minimum ? "danger" : "text";
  return (
    <Tile className={cn("grid gap-5", className)} aria-busy={loading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <TileLabel>What you have</TileLabel>
        <Label>Live · the numbers a rule checks</Label>
      </div>
      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="grid gap-2"><Sk className="h-3 w-16" /><Sk className="h-7 w-32" /><Sk className="h-3 w-40" /></div>)}</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          <Cell label="Wallet · idle" value={`${fmtUsdc(positions.idleUsdc)} USDC`} sub={xlm !== null ? `${xlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM for fees` : undefined} reads="wallet" />
          <Cell label={`Hub ${POOLS.A.hub} · supplied`} value={`${fmtUsdc(a.supplied)} USDC`} sub={a.sub} reads="hub APY · rate gap" />
          <Cell label={`Hub ${POOLS.B.hub} · supplied`} value={`${fmtUsdc(b.supplied)} USDC`} sub={b.sub} reads="hub APY · rate gap" />
          <Cell label="Loan health" value={health.hasLoan ? fmtHealth(health.factor) : "No debt"} sub={health.hasLoan ? `liquidation at ${fmtHealth(health.liquidationAt)}` : "nothing borrowed, nothing to repay"} tone={healthTone} reads="health" />
          <Cell label="USD/TRY" value={fx.tryPerUsd && fx.tryPerUsd > 0 ? fmtFx(fx.tryPerUsd) : "No reading"} sub={fx.stale ? "stale: the oracle has not published lately" : gap !== null ? `rate gap between the hubs ${fmtPct(gap)}` : undefined} tone={fx.stale ? "dim" : "text"} reads="USD/TRY" />
          <Cell label="Koul's key" value={!access.loaded ? "…" : access.active ? (access.daysLeft === null ? "Active" : `${access.daysLeft}D left`) : "Not given"} sub={access.active ? "revoke any time from the chip above" : "given with your first save"} tone={access.active ? "lime" : "dim"} />
        </div>
      )}
    </Tile>
  );
}
