"use client";

/**
 * "If you deposit ₺10.000…": the one interactive thing on the home page. Every number derives from the live USD/TRY
 * rate and the best pool's rate, and the arithmetic is printed underneath so nobody has to take it on trust.
 */
import * as React from "react";
import { Card, Money, AnimatedNumber, Sk, Term } from "@/components/koul/primitives";
import { useFx, usePools, bestPool } from "@/hooks/use-market";
import { fmtFx, fmtPct, fmtUsdc, fmtTry, fmtTryWhole } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [5_000, 10_000, 50_000];
const MAX_DIGITS = 9;
const grouped = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

export function EarningsCalculator({ className }: { className?: string }) {
  const [amount, setAmount] = React.useState(10_000);
  const [text, setText] = React.useState(() => grouped.format(10_000));
  const fx = useFx();
  const pools = usePools();
  const best = bestPool(pools.pools);

  const rate = fx.fx.tryPerUsd;
  const usdc = rate > 0 ? amount / rate : 0;
  const bestApy = best?.supplyApy ?? 0;
  const yearlyUsdc = (usdc * bestApy) / 100;
  const yearlyTry = yearlyUsdc * rate;
  const loading = fx.loading || pools.loading || best === null || rate <= 0;

  const setFromDigits = (digits: string) => {
    const n = digits ? Number(digits) : 0;
    setAmount(n);
    setText(digits ? grouped.format(n) : "");
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => setFromDigits(e.target.value.replace(/\D/g, "").slice(0, MAX_DIGITS));

  return (
    <Card className={cn("p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="calc-amount" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">If you deposit</label>
      </div>

      <div className="mt-2 flex items-baseline gap-2 border-b border-border pb-2 transition-colors focus-within:border-foreground/40">
        <span className="num text-3xl leading-none text-muted-foreground sm:text-4xl" aria-hidden>₺</span>
        <input
          id="calc-amount"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={onChange}
          placeholder="10.000"
          aria-label="Lira amount"
          className="num w-full min-w-0 bg-transparent text-3xl leading-none text-foreground outline-none placeholder:text-muted-foreground/40 sm:text-4xl"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setFromDigits(String(p))}
            aria-pressed={amount === p}
            className={cn(
              "num inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-9",
              amount === p ? "border-saffron/40 bg-saffron-soft text-saffron" : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            )}
          >
            {fmtTryWhole(p)}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3" aria-busy>
            <Sk className="h-9 w-48" />
            <Sk className="h-5 w-64 max-w-full" />
            <Sk className="h-3 w-56 max-w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm text-muted-foreground">≈</span>
              <Money value={usdc} size="xl" />
              <span className="text-sm text-muted-foreground">
                at <span className="num text-foreground">{fmtFx(rate)}</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              earns about <Money value={yearlyTry} currency="TRY" size="lg" className="text-foreground" /> a year at{" "}
              <Term detail={`${best?.technical ?? ""} · deposit rate ${fmtPct(bestApy)}, annualised`}>{best?.name ?? "the best pool"}&rsquo;s rate</Term> of{" "}
              <AnimatedNumber value={bestApy} format={fmtPct} className="text-foreground" />
            </p>
            <p className="num mt-3 text-[11px] leading-relaxed text-muted-foreground">
              {fmtTryWhole(amount)} ÷ {fmtFx(rate)} = {fmtUsdc(usdc)} USDC · × {fmtPct(bestApy)} = {fmtUsdc(yearlyUsdc)} USDC a year · × {fmtFx(rate)} = {fmtTry(yearlyTry)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Today&rsquo;s rate, not a promise. Pool rates move as the pool is used.</p>
          </>
        )}
      </div>
    </Card>
  );
}
