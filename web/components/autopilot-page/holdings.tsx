"use client";

/**
 * "What you have": the numbers a rule is written against, live, on the page where the rule is written. The idle
 * wallet, each hub with its rate, debt and free cash, loan health, USD/TRY with the gap between the hubs, and how
 * long Koul's key lasts. The cell the open rule reads (its condition subject) or moves from (its action) gets the
 * accent border and flashes once; on a phone the cells are one scrolling strip and the linked cell scrolls into
 * view. With no rule open the panel is one line.
 */
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Label, Sk, Tile, TileLabel } from "@/components/signal";
import { Rolling } from "@/components/signal/rolling";
import type { Pool, Positions, Health } from "@/lib/data/types";
import { fmtFx, fmtHealth, fmtPct, fmtUsdc } from "@/lib/format";
import { POOLS, type ActionKind, type Condition, type PoolId } from "@/lib/model/autopilot";
import { cn } from "@/lib/utils";

export type CellKey = "wallet" | "hubA" | "hubB" | "health" | "fx" | "key";

/** What the open rule reads and moves from. */
export interface HoldingsFocus { conditions: Condition[]; action: ActionKind | null; actionPool?: PoolId }

/** The cells a rule touches: its condition subjects, and the base its action moves from. */
export function cellsFor(f: HoldingsFocus | null): CellKey[] {
  if (!f) return [];
  const out = new Set<CellKey>();
  for (const c of f.conditions) {
    if (c.kind === "idle_usdc") out.add("wallet");
    else if (c.kind === "health_factor") out.add("health");
    else if (c.kind === "fx_price") out.add("fx");
    else if (c.kind === "pool_rate") out.add((c.pool ?? "B") === "A" ? "hubA" : "hubB");
    else if (c.kind === "rate_gap") { out.add("hubA"); out.add("hubB"); }
  }
  if (f.action === "supply_from_wallet" || f.action === "repay_from_wallet") out.add("wallet");
  if (f.action === "withdraw_to_wallet" || f.action === "move_to_best_pool") { out.add("hubA"); out.add("hubB"); }
  return [...out];
}

function Cell({ id, label, value, sub, tone = "text", reads, linked, flash }: { id: CellKey; label: string; value: string; sub?: string; tone?: "text" | "lime" | "danger" | "dim"; reads?: string; linked: boolean; flash: number }) {
  const t = { text: "text-text", lime: "text-accent-text", danger: "text-danger", dim: "text-dim" }[tone];
  return (
    <div data-cell={id} className={cn("grid min-w-[236px] shrink-0 snap-start content-start gap-1.5 rounded-[var(--radius-group)] border px-3 py-2 transition-colors md:min-w-0", linked ? "border-accent-text" : "border-transparent")}>
      <Label>{label}</Label>
      <div key={linked ? flash : -1} className={cn("mono num text-[22px] font-bold leading-none md:text-[24px]", t, linked && "animate-flash")}><Rolling text={value} /></div>
      {sub && <Label tone="dim" className="normal-case">{sub}</Label>}
      {reads && <Label tone={linked ? "lime" : "dim"}>reads as {reads}</Label>}
    </div>
  );
}

export function Holdings({ positions, health, pools, fx, xlm, access, loading, focus, collapsed, className }: {
  positions: Positions;
  health: Health;
  pools: Pool[];
  fx: { tryPerUsd: number | null; stale: boolean };
  xlm: number | null;
  access: { active: boolean; daysLeft: number | null; loaded: boolean };
  loading: boolean;
  /** The rule being edited, or null. */
  focus: HoldingsFocus | null;
  /** No rule editor open: one line, expandable by hand. */
  collapsed: boolean;
  className?: string;
}) {
  const [opened, setOpened] = React.useState(false);
  const linked = React.useMemo(() => cellsFor(focus), [focus]);
  const linkedKey = linked.join(",");
  // A new link flashes the value once and, on a phone, scrolls the first linked cell into the strip's view.
  const [flash, setFlash] = React.useState(0);
  const [seen, setSeen] = React.useState(linkedKey);
  if (linkedKey !== seen) { setSeen(linkedKey); setFlash((n) => n + 1); }
  const strip = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const first = linked[0];
    if (!first || collapsed) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    strip.current?.querySelector<HTMLDivElement>(`[data-cell="${first}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [linkedKey, linked, collapsed]);

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
  const oneLine = [`${fmtUsdc(positions.idleUsdc)} USDC idle`, a.pool ? `Hub ${POOLS.A.hub} ${fmtPct(a.pool.supplyApy)}` : null, b.pool ? `Hub ${POOLS.B.hub} ${fmtPct(b.pool.supplyApy)}` : null, health.hasLoan ? `health ${fmtHealth(health.factor)}` : null, fx.tryPerUsd && fx.tryPerUsd > 0 ? `USD/TRY ${fmtFx(fx.tryPerUsd)}` : null].filter(Boolean).join(" · ");
  const isLinked = (k: CellKey) => linked.includes(k);

  if (collapsed && !opened) {
    return (
      <button type="button" onClick={() => setOpened(true)} aria-expanded={false} className={cn("flex min-h-12 w-full items-center gap-3 rounded-full bg-surface px-5 text-left hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text", className)}>
        <span className="label shrink-0 text-muted">What you have</span>
        <span className="mono min-w-0 flex-1 truncate text-[14px] text-text">{loading ? <Sk className="inline-block h-3.5 w-48 align-middle" /> : oneLine}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
    );
  }

  return (
    <Tile className={cn("grid gap-4", className)} aria-busy={loading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <TileLabel>What you have</TileLabel>
        {collapsed ? (
          <button type="button" onClick={() => setOpened(false)} className="label min-h-11 rounded-full px-3 text-muted hover:text-text">Collapse</button>
        ) : (
          <Label>{linked.length ? "Lit: what this rule reads and moves" : "Live · the numbers a rule checks"}</Label>
        )}
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="grid gap-2 px-3 py-2"><Sk className="h-3 w-16" /><Sk className="h-7 w-32" /><Sk className="h-3 w-40" /></div>)}</div>
      ) : (
        <div ref={strip} className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 [&::-webkit-scrollbar]:hidden">
          <Cell id="wallet" linked={isLinked("wallet")} flash={flash} label="Wallet · idle" value={`${fmtUsdc(positions.idleUsdc)} USDC`} sub={xlm !== null ? `${xlm.toLocaleString("en-US", { maximumFractionDigits: 2 })} XLM for fees` : undefined} reads="wallet" />
          <Cell id="hubA" linked={isLinked("hubA")} flash={flash} label={`Hub ${POOLS.A.hub} · supplied`} value={`${fmtUsdc(a.supplied)} USDC`} sub={a.sub} reads="hub APY · rate gap" />
          <Cell id="hubB" linked={isLinked("hubB")} flash={flash} label={`Hub ${POOLS.B.hub} · supplied`} value={`${fmtUsdc(b.supplied)} USDC`} sub={b.sub} reads="hub APY · rate gap" />
          <Cell id="health" linked={isLinked("health")} flash={flash} label="Loan health" value={health.hasLoan ? fmtHealth(health.factor) : "No debt"} sub={health.hasLoan ? `liquidation at ${fmtHealth(health.liquidationAt)}` : "nothing borrowed, nothing to repay"} tone={healthTone} reads="health" />
          <Cell id="fx" linked={isLinked("fx")} flash={flash} label="USD/TRY" value={fx.tryPerUsd && fx.tryPerUsd > 0 ? fmtFx(fx.tryPerUsd) : "No reading"} sub={fx.stale ? "stale: the oracle has not published lately" : gap !== null ? `rate gap between the hubs ${fmtPct(gap)}` : undefined} tone={fx.stale ? "dim" : "text"} reads="USD/TRY" />
          <Cell id="key" linked={false} flash={flash} label="Koul's key" value={!access.loaded ? "…" : access.active ? (access.daysLeft === null ? "Active" : `${access.daysLeft}D left`) : "Not given"} sub={access.active ? "revoke any time from the chip above" : "given with your first start"} tone={access.active ? "lime" : "dim"} />
        </div>
      )}
    </Tile>
  );
}
