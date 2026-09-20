"use client";

/**
 * Today's USD/TRY from the oracle. The full card fills the right column on desktop while no flow is open;
 * the strip sits between actions and history on phones.
 */
import * as React from "react";
import { AnimatedNumber, Card, DemoChip, LiveDot, Pill, Term } from "@/components/koul/primitives";
import { useFx } from "@/hooks/use-market";
import { fmtDuration, fmtFx } from "@/lib/format";
import { cn } from "@/lib/utils";

const ORACLE_DETAIL = "Reflector-shaped mock oracle lastprice(TRY), USD per TRY with 14 decimals, inverted; polled every 10 s. Demo controls run in the separate oracle admin app.";

function Status({ fx }: { fx: ReturnType<typeof useFx> }) {
  if (fx.loading) return <span className="skeleton inline-block h-6 w-16 rounded-full" aria-busy />;
  if (fx.fx.stale) return <Pill tone="warning" dot>Stale</Pill>;
  if (fx.source === "mock") return <DemoChip />;
  return <Pill tone="positive" dot pulse>Live</Pill>;
}

export function RateCard({ className }: { className?: string }) {
  const fx = useFx();
  return (
    <Card className={cn("animate-rise", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">USD/TRY today</span>
        <Status fx={fx} />
      </div>
      {fx.loading ? <span className="skeleton mt-3 block h-11 w-36" aria-busy /> : <AnimatedNumber value={fx.fx.tryPerUsd} format={fmtFx} className="mt-2 block text-[2.75rem] leading-none" />}
      <p className="mt-2 text-xs text-muted-foreground">From the <Term detail={ORACLE_DETAIL}>oracle</Term>, {fmtDuration(fx.fx.ageSec)} ago. One dollar buys this many lira; every quote on this page uses it.</p>
      <div className="mt-5 border-t border-border pt-4">
        <div className="text-sm font-medium">How a lira deposit works</div>
        <ol className="mt-2.5 grid gap-2.5 text-sm text-muted-foreground">
          <Step n={1}>You send lira from your bank with a reference. A normal FAST transfer.</Step>
          <Step n={2}>The bank partner converts it at the rate above and pays a <Term detail="Ownerless classic G-account per transfer, sponsored by the keeper, pre-authorised forward and cleanup.">temporary receiving account</Term>.</Step>
          <Step n={3}>USDC lands in your wallet on its own. Nothing to sign, nothing to remember.</Step>
        </ol>
      </div>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] text-foreground" aria-hidden>{n}</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

export function RateStrip({ className }: { className?: string }) {
  const fx = useFx();
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">USD/TRY</span>
        {fx.loading ? <span className="skeleton inline-block h-5 w-16" aria-busy /> : <AnimatedNumber value={fx.fx.tryPerUsd} format={fmtFx} className="text-lg" />}
        {!fx.loading && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">{!fx.fx.stale && <LiveDot tone="positive" />}{fmtDuration(fx.fx.ageSec)} ago</span>}
      </div>
      <Status fx={fx} />
    </div>
  );
}
