"use client";

/** Every XOXNO testnet market, live: asset and hub, deposit rate, borrow rate, liquidity, utilisation. Each card opens the market on xoxno.com. */
import { ArrowUpRight } from "lucide-react";
import { Section, AnimatedNumber, Term, Pill, LiveDot, SkCard, ErrorState } from "@/components/koul/primitives";
import { useMarkets } from "@/hooks/use-market";
import type { MarketReading } from "@/lib/data/live";
import { XOXNO_APP } from "@/lib/data/markets";
import { fmtPct, fmtUsdcLoose, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./hooks";

export function PoolCards() {
  const m = useMarkets();
  const now = useNow(1000);
  const live = !m.loading && !m.error && m.markets.length > 0;
  const ageSec = live && now !== null && m.updatedAt > 0 ? Math.max(0, Math.round((now - m.updatedAt) / 1000)) : null;
  const best = m.markets.reduce<MarketReading | null>((a, b) => (a === null || b.supplyApy > a.supplyApy ? b : a), null);

  return (
    <Section
      title="Markets on XOXNO"
      description="Every market Koul can act on. Rates are read from the pool contract as you look."
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {m.loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkCard key={i} lines={2} />)
        ) : (
          m.markets.map((x) => <MarketCard key={`${x.asset}-${x.hub}`} market={x} paysMost={best !== null && best.supplyApy > 0 && x === best} />)
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Testnet markets of <a href={`${XOXNO_APP}/defi/lending`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">XOXNO lending</a>. Koul's rules move USDC between the two USDC hubs today.</p>
    </Section>
  );
}

function MarketCard({ market, paysMost }: { market: MarketReading; paysMost: boolean }) {
  const util = Math.min(1, Math.max(0, market.utilization));
  return (
    <a
      href={market.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${market.label} on XOXNO`}
      className={cn(
        "group flex min-w-0 flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
        paysMost ? "border-saffron/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{market.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            <Term detail={`XOXNO pool market, HubAssetKey { asset: ${market.asset.slice(0, 6)}…, hub_id: ${market.hub} }`}>hub {market.hub}</Term>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {paysMost && <Pill tone="saffron">Pays most</Pill>}
          <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <AnimatedNumber value={market.supplyApy} format={fmtPct} className="text-[2.25rem] leading-none tracking-tight" />
        <span className="text-sm text-muted-foreground">deposit, a year</span>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Borrow rate</dt>
        <dd className="num text-right">{fmtPct(market.borrowApy)}</dd>
        <dt className="text-muted-foreground">Supplied</dt>
        <dd className="num min-w-0 text-right">{fmtUsdcLoose(market.supplied)} {market.name === "XLMUSDC_LP" ? "LP" : market.name.replace("_HUB2", "")}</dd>
        <dt className="text-muted-foreground"><Term detail="Utilisation: borrowed ÷ supplied. The deposit rate rises as more of the market is in use.">In use</Term></dt>
        <dd className="num text-right">{fmtInt(util * 100)}%</dd>
      </dl>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-foreground/45 transition-[width] duration-700" style={{ width: `${util * 100}%` }} />
      </div>
    </a>
  );
}
