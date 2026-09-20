"use client";

/** Every XOXNO testnet market in one draggable line: asset, hub, deposit and borrow rate, liquidity, utilisation. Each card opens that market on xoxno.com. */
import { ArrowUpRight } from "lucide-react";
import { Section, AnimatedNumber, Term, Pill, LiveDot, ErrorState, Sk } from "@/components/koul/primitives";
import { Rail } from "@/components/koul/rail";
import { useMarkets } from "@/hooks/use-market";
import type { MarketReading } from "@/lib/data/live";
import { XOXNO_APP } from "@/lib/data/markets";
import { fmtPct, fmtUsdcLoose, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./hooks";

const CARD = "w-[17.5rem] shrink-0 snap-start sm:w-[19rem]";

export function PoolCards() {
  const m = useMarkets();
  const now = useNow(1000);
  const live = !m.loading && !m.error && m.markets.length > 0;
  const ageSec = live && now !== null && m.updatedAt > 0 ? Math.max(0, Math.round((now - m.updatedAt) / 1000)) : null;
  const best = m.markets.reduce<MarketReading | null>((a, b) => (a === null || b.supplyApr > a.supplyApr ? b : a), null);

  return (
    <Section
      title="Markets on XOXNO"
      description="Every market Koul can act on, read from the pool contract as you look. Drag to see them all."
      aside={
        live ? (
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <LiveDot /> Live{ageSec !== null && <> · updated <span className="num">{ageSec} s</span> ago</>}
          </span>
        ) : null
      }
    >
      {m.error && !m.loading && (
        <ErrorState className="mb-4" title="Could not read the markets" description={m.markets.length ? "Showing the last read until the next one succeeds." : m.error.message} onRetry={() => void m.refresh()} />
      )}
      <Rail label="XOXNO markets">
        {m.loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn(CARD, "rounded-xl border border-border bg-card p-4 sm:p-5")} aria-busy>
                <Sk className="mb-2 h-4 w-32" />
                <Sk className="mb-5 h-3 w-16" />
                <Sk className="mb-5 h-9 w-40" />
                <Sk className="mb-2 h-3 w-full" />
                <Sk className="h-3 w-2/3" />
              </div>
            ))
          : m.markets.map((x) => <MarketCard key={`${x.asset}-${x.hub}`} market={x} paysMost={best !== null && best.supplyApr > 0 && x === best} />)}
      </Rail>
      <p className="mt-4 text-xs text-muted-foreground">
        Testnet markets of <a href={`${XOXNO_APP}/defi/lending`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">XOXNO lending</a>, on{" "}
        <Term detail="A spoke is a risk module: it sets the loan-to-value, caps and liquidation terms for the assets an account may use. Koul's wallets are created on spoke 3, which XOXNO writes as #3.">spoke 3</Term>. Rules move USDC between the two USDC hubs today.
      </p>
    </Section>
  );
}

function MarketCard({ market, paysMost }: { market: MarketReading; paysMost: boolean }) {
  const util = Math.min(1, Math.max(0, market.utilization));
  const unit = market.name === "XLMUSDC_LP" ? "LP" : market.name.replace("_HUB2", "");
  return (
    <a
      href={market.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      aria-label={`${market.label} on XOXNO`}
      className={cn(
        CARD,
        "group flex flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
        paysMost ? "border-saffron/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{market.pair}</div>
          <div className="num mt-1 text-xs text-muted-foreground">
            <Term detail={`XOXNO writes a market as #spoke • #hub. This is spoke 3 on the ${market.hubName} hub, HubAssetKey { asset: ${market.asset.slice(0, 6)}…, hub_id: ${market.hub} }.`}>#3 • #{market.hub}</Term>
            <span className="ml-2 font-sans text-muted-foreground">{market.hubName} hub</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {paysMost && <Pill tone="saffron">Pays most</Pill>}
          <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
        <AnimatedNumber value={market.supplyApy} format={fmtPct} className="text-[2.25rem] leading-none tracking-tight" />
        <span className="text-sm text-muted-foreground"><Term detail={`Compounded, as XOXNO shows it. The pool's simple annual rate is ${fmtPct(market.supplyApr)}, which is what the router's rules compare.`}>deposit APY</Term></span>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Borrow APY</dt>
        <dd className="num text-right">{fmtPct(market.borrowApy)}</dd>
        <dt className="text-muted-foreground">Supplied</dt>
        <dd className="num min-w-0 truncate text-right">{fmtUsdcLoose(market.supplied)} {unit}</dd>
        <dt className="text-muted-foreground">Available</dt>
        <dd className="num min-w-0 truncate text-right">{fmtUsdcLoose(market.cash)} {unit}</dd>
        <dt className="text-muted-foreground"><Term detail="Utilisation: borrowed ÷ supplied. The deposit rate rises as more of the market is in use.">In use</Term></dt>
        <dd className="num text-right">{fmtInt(util * 100)}%</dd>
      </dl>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-700", util > 0.9 ? "bg-warning" : "bg-foreground/45")} style={{ width: `${util * 100}%` }} />
      </div>
    </a>
  );
}
