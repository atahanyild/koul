"use client";

/** One card per pool, live from XOXNO. Big rate, what the pool can release, how much of it is in use. */
import { Card, Section, AnimatedNumber, Term, Pill, LiveDot, DemoChip, SkCard, ErrorState } from "@/components/koul/primitives";
import { usePools, bestPool, rateGap } from "@/hooks/use-market";
import type { Pool } from "@/lib/data/types";
import { fmtPct, fmtUsdc, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "./hooks";

export function PoolCards() {
  const pools = usePools();
  const now = useNow(1000);
  const best = bestPool(pools.pools);
  const gap = rateGap(pools.pools);
  const live = !pools.loading && pools.source === "live";
  const ageSec = live && now !== null && pools.updatedAt > 0 ? Math.max(0, Math.round((now - pools.updatedAt) / 1000)) : null;

  return (
    <Section
      title="The pools"
      description="Two dollar pools. Supply to either, withdraw whenever you like."
      aside={
        live ? (
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <LiveDot /> Live{ageSec !== null && <> · updated <span className="num">{ageSec} s</span> ago</>}
          </span>
        ) : !pools.loading ? (
          <DemoChip />
        ) : null
      }
    >
      {pools.error && !pools.loading && (
        <ErrorState className="mb-4" title="Could not read the pools" description="Showing the sample rates until the next read succeeds." onRetry={() => void pools.refresh()} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {pools.loading ? (
          <>
            <SkCard lines={2} />
            <SkCard lines={2} />
          </>
        ) : (
          pools.pools.map((p) => <PoolCard key={p.id} pool={p} paysMore={gap > 0 && p.id === best.id} />)
        )}
      </div>
    </Section>
  );
}

function PoolCard({ pool, paysMore }: { pool: Pool; paysMore: boolean }) {
  const util = Math.min(1, Math.max(0, pool.utilization));
  return (
    <Card className={cn("flex min-w-0 flex-col", paysMore && "border-saffron/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium">
          <Term detail={pool.technical}>{pool.name}</Term>
        </div>
        {paysMore && <Pill tone="saffron">Pays more</Pill>}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <AnimatedNumber value={pool.supplyApy} format={fmtPct} className="text-[2.5rem] leading-none tracking-tight sm:text-[2.75rem]" />
        <span className="text-sm text-muted-foreground">a year</span>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground">Available to withdraw</dt>
        <dd className="num min-w-0 text-right">{fmtUsdc(pool.availableUsdc)} USDC</dd>
        <dt className="text-muted-foreground">
          <Term detail="Utilisation: borrowed ÷ supplied. The deposit rate rises as more of the pool is in use.">In use</Term>
        </dt>
        <dd className="num text-right">{fmtInt(util * 100)}%</dd>
      </dl>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-foreground/45 transition-[width] duration-700" style={{ width: `${util * 100}%` }} />
      </div>
    </Card>
  );
}
