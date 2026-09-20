"use client";

/**
 * Every XOXNO testnet market in one line, on the shadcn carousel (Embla) with its auto-scroll plugin: the row
 * drifts on its own, stops under the cursor or keyboard focus, and picks up again when you leave. Someone who
 * asked for less motion gets a still row. Each card opens that market on xoxno.com.
 */
import * as React from "react";
import AutoScroll from "embla-carousel-auto-scroll";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import { Section, AnimatedNumber, Term, Pill, LiveDot, ErrorState, Sk } from "@/components/koul/primitives";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useMarkets } from "@/hooks/use-market";
import type { MarketReading } from "@/lib/data/live";
import { fmtPct, fmtUsdcLoose, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./hooks";

const ARROW = "static size-8 translate-y-0 shrink-0";
const ITEM = "basis-[17.5rem] pl-4 sm:basis-[19rem]";

export function PoolCards() {
  const m = useMarkets();
  const now = useNow(1000);
  const plugins = useAutoScroll();
  const live = !m.loading && !m.error && m.markets.length > 0;
  const ageSec = live && now !== null && m.updatedAt > 0 ? Math.max(0, Math.round((now - m.updatedAt) / 1000)) : null;
  const best = m.markets.reduce<MarketReading | null>((a, b) => (a === null || b.supplyApr > a.supplyApr ? b : a), null);

  return (
    <Carousel opts={{ align: "start", loop: plugins.length > 0, containScroll: plugins.length > 0 ? undefined : "trimSnaps" }} plugins={plugins}>
      <Section
        title="Markets on XOXNO"
        description="Every market Koul can act on, read from the pool contract as you look."
        aside={
          <div className="flex shrink-0 items-center gap-3">
            {live && (
              <span className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                <LiveDot /> Live{ageSec !== null && <> · updated <span className="num">{ageSec} s</span> ago</>}
              </span>
            )}
            <div className="hidden items-center gap-1.5 md:flex">
              <CarouselPrevious className={ARROW} />
              <CarouselNext className={ARROW} />
            </div>
          </div>
        }
      >
        {m.error && !m.loading && (
          <ErrorState className="mb-4" title="Could not read the markets" description={m.markets.length ? "Showing the last read until the next one succeeds." : m.error.message} onRetry={() => void m.refresh()} />
        )}

        <CarouselContent className="-ml-4 py-1">
          {m.loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <CarouselItem key={i} className={ITEM}>
                  <div className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-busy>
                    <Sk className="mb-2 h-4 w-32" />
                    <Sk className="mb-5 h-3 w-16" />
                    <Sk className="mb-5 h-9 w-40" />
                    <Sk className="mb-2 h-3 w-full" />
                    <Sk className="h-3 w-2/3" />
                  </div>
                </CarouselItem>
              ))
            : m.markets.map((x, i) => (
                <CarouselItem key={`${x.asset}-${x.hub}`} className={ITEM}>
                  <MarketCard market={x} index={i} paysMost={best !== null && best.supplyApr > 0 && x === best} />
                </CarouselItem>
              ))}
        </CarouselContent>

      </Section>
    </Carousel>
  );
}

/** The auto-scroll plugin, held still for one render pass and skipped when the viewer asked for reduced motion. */
function useAutoScroll() {
  const [reduced, setReduced] = React.useState(true);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const plugin = React.useRef(AutoScroll({ speed: 0.6, startDelay: 0, stopOnMouseEnter: true, stopOnFocusIn: true, stopOnInteraction: false }));
  return React.useMemo(() => (reduced ? [] : [plugin.current]), [reduced]);
}

function MarketCard({ market, paysMost, index }: { market: MarketReading; paysMost: boolean; index: number }) {
  const util = Math.min(1, Math.max(0, market.utilization));
  const unit = market.name === "XLMUSDC_LP" ? "LP" : market.name.replace("_HUB2", "");
  return (
    <motion.a
      href={market.url}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      aria-label={`${market.label} on XOXNO`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
        paysMost ? "border-saffron/40" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{market.pair}</div>
          <div className="mono mt-1 flex items-center gap-2 truncate whitespace-nowrap text-xs text-muted-foreground">
            <Term detail={`XOXNO writes a market as #spoke • #hub. This is spoke 3 on the ${market.hubName} hub, HubAssetKey { asset: ${market.asset.slice(0, 6)}…, hub_id: ${market.hub} }.`}>#3 • #{market.hub}</Term>
            <span className="truncate font-sans">{market.hubName} hub</span>
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
      <div className="mt-auto pt-3">
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <motion.div className={cn("h-full rounded-full", util > 0.9 ? "bg-warning" : "bg-foreground/45")} initial={{ width: 0 }} animate={{ width: `${util * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
        </div>
      </div>
    </motion.a>
  );
}
