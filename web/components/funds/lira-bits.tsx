"use client";

/** Pieces both lira flows share: the live quote line, the running header, the done card and the stopped card. */
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { Transfer } from "@/lib/data/types";
import type { FxState } from "@/hooks/use-market";
import { AnimatedNumber, ErrorState, LiveDot, Money, Pill, Term, TxLink } from "@/components/koul/primitives";
import { Button } from "@/components/ui/button";
import { fmtDuration, fmtFx, fmtTime, fmtTry, fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TransferProgress } from "./timeline";
import { useCountUpFromZero } from "./use-funds";

const ORACLE_DETAIL = "Reflector-shaped mock oracle lastprice(TRY), USD per TRY with 14 decimals, inverted; polled every 10 s.";

/** "≈ 102.48 USDC at 48.79" with the rate's age; a warning when the oracle price is stale. */
export function QuoteLine({ amount, currency, fx, className }: { amount: number; currency: "USDC" | "TRY"; fx: FxState; className?: string }) {
  const rate = fx.fx.tryPerUsd;
  const empty = amount <= 0;
  return (
    <div className={cn("rounded-xl bg-surface-2/60 px-4 py-3", className)} aria-live="polite">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className={cn("text-sm transition-opacity", empty && "opacity-60")}>
          <span className="text-muted-foreground">≈ </span>
          {currency === "USDC" ? (
            <><AnimatedNumber value={amount} format={fmtUsdc} className="text-lg text-foreground" /> <span className="text-xs font-medium tracking-wide text-muted-foreground">USDC</span></>
          ) : (
            <AnimatedNumber value={amount} format={fmtTry} className="text-lg text-foreground" />
          )}
          <span className="text-muted-foreground"> at </span>
          <span className="num text-foreground">{fx.loading ? "…" : fmtFx(rate)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {fx.fx.stale ? (
            <Pill tone="warning" dot>Rate is stale</Pill>
          ) : (
            <span className="inline-flex items-center gap-1.5"><LiveDot tone="positive" /><Term detail={ORACLE_DETAIL}>rate</Term> from {fmtDuration(fx.fx.ageSec)} ago</span>
          )}
        </div>
      </div>
      {fx.fx.stale && <p className="mt-2 text-xs text-warning">The oracle price is older than {fmtDuration(fx.fx.maxAgeSec)}. The bank partner quotes a fresh rate when you start.</p>}
    </div>
  );
}

/** What is moving, at what rate, since when. Sits above the progress bar. */
export function RunningHeader({ transfer }: { transfer: Transfer }) {
  const inbound = transfer.direction === "in";
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{inbound ? "Depositing" : "Withdrawing"}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {inbound ? <Money value={transfer.amountTry} currency="TRY" size="lg" animate={false} /> : <Money value={transfer.amountUsdc} size="lg" animate={false} />}
            <ArrowRight className="size-4 self-center text-muted-foreground" aria-hidden />
            {inbound ? <Money value={transfer.amountUsdc} size="lg" animate={false} /> : <Money value={transfer.amountTry} currency="TRY" size="lg" animate={false} />}
          </div>
          <div className="num mt-1 text-xs text-muted-foreground">at {fmtFx(transfer.rate)} · started {fmtTime(transfer.startedAt)}{transfer.reference && <> · {transfer.reference}</>}</div>
        </div>
      </div>
      <TransferProgress transfer={transfer} className="mt-4" />
    </div>
  );
}

/** The arrival moment: the amount counts up from zero. */
export function DoneCard({ transfer, headline, subline, hash, primary, secondary }: { transfer: Transfer; headline: string; subline: React.ReactNode; hash?: string; primary: React.ReactNode; secondary: React.ReactNode }) {
  const inbound = transfer.direction === "in";
  const shown = useCountUpFromZero(inbound ? transfer.amountUsdc : transfer.amountTry);
  return (
    <div className="animate-rise flex flex-col items-center py-2 text-center" role="status" aria-live="polite">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-positive-soft text-positive"><Check className="size-6" strokeWidth={2.5} aria-hidden /></div>
      {inbound ? <Money value={shown} size="hero" /> : <Money value={shown} currency="TRY" size="hero" />}
      <div className="display mt-3 text-2xl leading-tight">{headline}</div>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{subline}</p>
      {hash && <TxLink hash={hash} className="mt-3 text-sm">See it on stellar.expert</TxLink>}
      <TransferProgress transfer={transfer} className="mt-6" />
      <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row">
        {secondary}
        {primary}
      </div>
    </div>
  );
}

export function PutItToWork() {
  return (
    <Button size="lg" className="min-h-11 flex-1 text-[15px]" render={<Link href="/autopilots" />}>
      Put it to work <ArrowRight data-icon="inline-end" aria-hidden />
    </Button>
  );
}

/** The runner reported a failure: say where it stopped and what did not happen. */
export function StoppedCard({ transfer, onRetry, onStartOver }: { transfer: Transfer; onRetry: () => void; onStartOver: () => void }) {
  const failed = transfer.steps.find((s) => s.state === "failed");
  const inbound = transfer.direction === "in";
  return (
    <div className="mt-5 flex flex-col gap-3">
      <ErrorState
        title={failed ? `Stopped at “${failed.title}”` : "The transfer stopped"}
        description={inbound ? `Nothing left your bank and no USDC moved. ${fmtTry(transfer.amountTry)} is still yours.` : `Your USDC stayed in your wallet. ${fmtUsdc(transfer.amountUsdc)} USDC did not move.`}
        onRetry={onRetry}
      />
      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={onStartOver}>Start over</Button>
    </div>
  );
}
