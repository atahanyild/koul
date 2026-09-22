"use client";

/**
 * Activity: everything that touched the wallet, newest first, in one list. Autopilot moves are AUTO, the user's
 * own are YOU; every row with a transaction links to the explorer. The node keeps about a week of events.
 */
import * as React from "react";
import { ArrowUpRight } from "lucide-react";
import { EmptyState, FilterChip, Label, Loadable, PillButton, SkRows, Tile } from "@/components/signal";
import { useActivity, type ActivityRow } from "@/hooks/use-activity";
import { explorerTx } from "@/lib/koul";
import { fmtUsdc } from "@/lib/format";
import { dayLabel, whenLabel } from "@/lib/model/labels";
import { cn } from "@/lib/utils";

type Filter = "all" | "auto" | "you";
const FILTERS: { value: Filter; label: string }[] = [{ value: "all", label: "All" }, { value: "auto", label: "Autopilot" }, { value: "you", label: "You" }];

function amountText(r: ActivityRow): string | null {
  if (r.amount === undefined) return null;
  if (r.signed) return `${r.amount >= 0 ? "+" : "−"}${fmtUsdc(Math.abs(r.amount))}`;
  return fmtUsdc(r.amount);
}

function useMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function ActivityPage() {
  const activity = useActivity();
  const now = useMinute();
  const [filter, setFilter] = React.useState<Filter>("all");
  const rows = activity.rows.filter((r) => filter === "all" || r.who === filter);
  const nothingAtAll = !activity.loading && activity.rows.length === 0;

  return (
    <div className="grid gap-4 md:gap-5">
      <div className="flex gap-2" role="group" aria-label="Filter">
        {FILTERS.map((f) => <FilterChip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</FilterChip>)}
      </div>
      <Tile padded={false} className="px-5 md:px-7">
        <Loadable loading={activity.loading} skeleton={<div className="py-2"><SkRows rows={5} /></div>} className={activity.loading ? "min-h-[400px]" : undefined}>
          {activity.error && !activity.loaded ? (
            <EmptyState title="Could not load" line={activity.error.message.slice(0, 120)} action={<PillButton variant="ghost" onClick={() => void activity.refresh()}>Try again</PillButton>} className="min-h-[400px]" />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nothing yet"
              line={nothingAtAll ? "Deposits, withdrawals and autopilot moves show up here" : filter === "auto" ? "Autopilot moves show up here" : "Your deposits, withdrawals and saves show up here"}
              action={nothingAtAll ? <PillButton size="lg" href="/deposit">Deposit</PillButton> : undefined}
              className="min-h-[400px]"
            />
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r, i) => {
                const amount = amountText(r);
                const who = r.who === "auto" ? "AUTO" : "YOU";
                const day = dayLabel(r.at, now);
                const newDay = i === 0 || dayLabel(rows[i - 1]!.at, now) !== day;
                return (
                  <React.Fragment key={r.id}>
                  {newDay && <li className="sticky top-0 z-10 -mx-5 bg-surface px-5 py-2 md:-mx-7 md:px-7" aria-label={day}><span className="label text-muted">{day}</span></li>}
                  <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 md:grid-cols-[112px_minmax(0,1fr)_auto_64px_44px] md:py-5">
                    <span className="mono order-3 col-span-2 text-muted md:order-1 md:col-span-1"><span className="md:hidden"><span className={cn(r.who === "auto" ? "text-accent-text" : "text-muted")}>{who}</span> · </span>{whenLabel(r.at, now)}</span>
                    <span className="order-1 min-w-0 truncate text-[16px] font-bold md:order-2">{r.title}</span>
                    <span className="mono order-2 text-right md:order-3">{amount ?? ""}</span>
                    <span className={cn("mono hidden text-right md:order-4 md:inline", r.who === "auto" ? "text-accent-text" : "text-muted")}>{who}</span>
                    <span className="hidden justify-end md:order-5 md:flex">
                      {r.txHash && (
                        <a href={explorerTx(r.txHash)} target="_blank" rel="noopener noreferrer" aria-label="Open the transaction on stellar.expert" className="inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent-text">
                          <ArrowUpRight className="size-4" />
                        </a>
                      )}
                    </span>
                    {r.txHash && (
                      <a href={explorerTx(r.txHash)} target="_blank" rel="noopener noreferrer" className="label order-4 col-span-2 inline-flex min-h-11 items-center text-muted hover:text-text md:hidden">Transaction ↗</a>
                    )}
                  </li>
                  </React.Fragment>
                );
              })}
            </ul>
          )}
        </Loadable>
      </Tile>
      {activity.since !== null && activity.rows.length > 0 && <Label className="px-2">Last 7 days · the network node keeps no older events</Label>}
    </div>
  );
}
