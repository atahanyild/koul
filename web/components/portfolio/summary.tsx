"use client";

/** The hero total with its lira equivalent and earning line, and the four tiles under it. */
import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Card, Money, AnimatedNumber, Term, Sk, LiveDot } from "@/components/koul/primitives";
import type { Positions, Health, Pool, FxPrice } from "@/lib/data/types";
import type { PoolId } from "@/lib/model/autopilot";
import { fmtFx, fmtHealth, fmtUsdc, fmtUsdcLoose, fmtTry, fmtDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HealthBar, healthTone } from "./health-bar";

export const totalOf = (p: Positions) => p.idleUsdc + p.supplied.A + p.supplied.B - p.borrowed.A - p.borrowed.B;
export const suppliedOf = (p: Positions) => p.supplied.A + p.supplied.B;
export const borrowedOf = (p: Positions) => p.borrowed.A + p.borrowed.B;
/** Σ supplied × rate, in USDC a year. */
export const yearlyEarnings = (p: Positions, pools: Pool[]) => pools.reduce((s, pool) => s + (p.supplied[pool.id] * pool.supplyApy) / 100, 0);

export function PortfolioHero({ positions, fx, fxLive, pools, poolsLoading, className }: { positions: Positions; fx: FxPrice; fxLive: boolean; pools: Pool[]; poolsLoading: boolean; className?: string }) {
  const total = totalOf(positions);
  const earning = yearlyEarnings(positions, pools);
  const rate = fx.tryPerUsd;
  return (
    <Card className={cn("flex min-w-0 flex-col justify-between p-5 sm:p-6", className)}>
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Total</div>
        <Money value={total} size="hero" className="mt-2" />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>≈</span>
          <Money value={total * rate} currency="TRY" size="md" className="text-foreground" />
          <span className="inline-flex items-center gap-1.5">
            at{" "}
            <Term detail={`USD/TRY from the Koul oracle (Reflector interface), published ${fmtDuration(fx.ageSec)} ago${fx.stale ? ", stale" : ""}`}>
              <span className="num text-foreground">{fmtFx(rate)}</span>
            </Term>
            {fxLive && <LiveDot className="ml-0.5" />}
          </span>
        </div>
      </div>
      <div className="mt-5 flex items-start gap-2.5 border-t border-border pt-4 text-sm">
        <TrendingUp className={cn("mt-0.5 size-4 shrink-0", earning > 0 ? "text-positive" : "text-muted-foreground")} aria-hidden />
        {poolsLoading ? (
          <Sk className="h-4 w-56 max-w-full" />
        ) : earning > 0 ? (
          <span className="min-w-0">
            Earning about <AnimatedNumber value={earning} className="text-foreground" /> USDC a year
            <span className="text-muted-foreground">
              {" "}· ≈ <AnimatedNumber value={earning * rate} format={fmtTry} />
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Not earning yet. Supply to a pool to start.</span>
        )}
      </div>
    </Card>
  );
}

export function PortfolioTiles({ positions, health }: { positions: Positions; health: Health }) {
  const supplied = suppliedOf(positions);
  const borrowed = borrowedOf(positions);
  const ids: PoolId[] = ["A", "B"];
  const inPools = ids.filter((id) => positions.supplied[id] > 0);
  const loanPools = ids.filter((id) => positions.borrowed[id] > 0);
  const tone = healthTone(health);
  const healthClass = { positive: "text-positive", warning: "text-warning", negative: "text-negative", none: "" }[tone];
  const healthSub = !health.hasLoan
    ? "nothing to watch"
    : tone === "negative"
      ? `under ${fmtHealth(health.liquidationAt)}, at risk`
      : tone === "warning"
        ? `under your ${fmtHealth(health.minimum)} guard`
        : `above your ${fmtHealth(health.minimum)} guard`;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <Tile label="In pools" sub={inPools.length === 0 ? "nothing supplied yet" : inPools.length === 2 ? `Pool A ${fmtUsdc(positions.supplied.A)} · Pool B ${fmtUsdc(positions.supplied.B)}` : `all in Pool ${inPools[0]}`}>
        <Money value={supplied} size="lg" />
      </Tile>
      <Tile
        label="In wallet"
        sub={
          <>
            <span className="num">{fmtUsdcLoose(positions.idleXlm)} XLM</span> for network fees, covered on testnet
          </>
        }
      >
        <Money value={positions.idleUsdc} size="lg" />
      </Tile>
      <Tile label="Loan" sub={borrowed > 0 ? `from Pool ${loanPools.join(" and ")}` : "nothing borrowed"}>
        {borrowed > 0 ? <Money value={borrowed} size="lg" /> : <Word>none</Word>}
      </Tile>
      <Tile
        label={<Term detail={`Health factor: XOXNO controller get_health_factor = collateral value ÷ debt. Liquidation at ${fmtHealth(health.liquidationAt)}; your guard repays at or under ${fmtHealth(health.minimum)}.`}>Loan health</Term>}
        sub={
          <>
            <div>{healthSub}</div>
            <HealthBar health={health} className="mt-2" />
          </>
        }
      >
        {health.hasLoan ? <AnimatedNumber value={health.factor ?? 0} format={fmtHealth} className={cn("text-2xl", healthClass)} /> : <Word>No loan</Word>}
      </Tile>
    </div>
  );
}

function Word({ children }: { children: React.ReactNode }) {
  return <span className="display text-2xl leading-none text-muted-foreground">{children}</span>;
}

function Tile({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex min-w-0 flex-col p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 min-w-0 overflow-hidden leading-none">{children}</div>
      {sub && <div className="mt-2 text-xs leading-snug text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function TilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Sk className="mb-3 h-3 w-16" />
          <Sk className="mb-3 h-7 w-28 max-w-full" />
          <Sk className="h-3 w-24 max-w-full" />
        </div>
      ))}
    </div>
  );
}
