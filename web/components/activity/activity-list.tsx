"use client";

/**
 * The ledger of everything that happened to the wallet: rows grouped by day, each with a plain title and detail, the
 * autopilot and rule that caused it, the amount when there is one, and the transaction on stellar.expert.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { Money, Pill, TxLink, Sk } from "@/components/koul/primitives";
import type { ActivityItem } from "@/lib/data/types";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/format";
import { KIND, TONE_CLASS, FILTERS, type FilterKey } from "./kinds";
import { Numbered } from "./numbered";

// ---------------------------------------------------------------- day grouping

const startOfDay = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

export function dayLabel(t: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear();
  return sameYear ? fmtDate(t) : `${fmtDate(t)} ${new Date(t).getFullYear()}`;
}

export function groupByDay(items: ActivityItem[], now: number): { key: number; label: string; items: ActivityItem[] }[] {
  const sorted = [...items].sort((a, b) => b.at - a.at);
  const groups: { key: number; label: string; items: ActivityItem[] }[] = [];
  for (const it of sorted) {
    const key = startOfDay(it.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(it);
    else groups.push({ key, label: dayLabel(it.at, now), items: [it] });
  }
  return groups;
}

// ---------------------------------------------------------------- filter chips

export function FilterChips({ value, onChange, counts, className }: { value: FilterKey; onChange: (k: FilterKey) => void; counts: Record<FilterKey, number>; className?: string }) {
  return (
    <div className={cn("-mx-4 overflow-x-auto no-scrollbar px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0", className)}>
      <div role="group" aria-label="Filter activity" className="flex w-max gap-2 py-0.5">
        {FILTERS.map((f) => {
          const on = f.key === value;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(f.key)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground",
              )}
            >
              {f.label}
              <span className={cn("num text-[11px]", on ? "text-background/70" : "text-muted-foreground/80")}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rows

export function ActivityRow({ item, now }: { item: ActivityItem; now: number }) {
  const k = KIND[item.kind];
  const Icon = k.icon;
  const hasUsdc = typeof item.amountUsdc === "number" && item.amountUsdc !== 0;
  const hasTry = typeof item.amountTry === "number" && item.amountTry !== 0;
  const iso = new Date(item.at).toISOString();
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-4 py-3.5 sm:px-5 sm:py-4">
      <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", TONE_CLASS[k.tone])} aria-hidden>
        <Icon className="size-4" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <div className="text-[15px] font-medium leading-snug text-foreground"><Numbered text={item.title} /></div>
        {item.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground"><Numbered text={item.detail} /></p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {item.autopilotName && (
            <Pill tone="neutral">
              {item.autopilotName}
              {item.ruleName && <><span className="opacity-50" aria-hidden>·</span>{item.ruleName}</>}
            </Pill>
          )}
          <time dateTime={iso} title={fmtDateTime(item.at)} className="whitespace-nowrap">{fmtRelative(item.at, now)}</time>
          {item.txHash && <TxLink hash={item.txHash} />}
        </div>
      </div>
      {(hasUsdc || hasTry) ? (
        <div className="flex flex-col items-end text-right">
          {hasUsdc && <Money value={item.amountUsdc!} signed size="sm" animate={false} className={cn("text-[15px]", item.amountUsdc! > 0 && "text-positive")} />}
          {hasTry && <Money value={item.amountTry!} currency="TRY" size="sm" animate={false} className="text-xs text-muted-foreground" />}
        </div>
      ) : <span aria-hidden />}
    </li>
  );
}

export function ActivityGroups({ items, now }: { items: ActivityItem[]; now: number }) {
  const groups = React.useMemo(() => groupByDay(items, now), [items, now]);
  return (
    <div className="grid gap-6">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <h2 className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-1 bg-background/95 px-1 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur md:top-0 md:pt-2">
            {g.label}
          </h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {g.items.map((it) => <ActivityRow key={it.id} item={it} now={now} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function ActivitySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy>
      <Sk className="mb-2 h-3 w-12" />
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-4 py-4 sm:px-5">
            <Sk className="size-9 rounded-full" />
            <div>
              <Sk className={cn("h-4", i % 2 ? "w-2/3" : "w-3/4")} />
              <Sk className="mt-2 h-3 w-5/6" />
              <div className="mt-2.5 flex gap-2"><Sk className="h-5 w-24 rounded-full" /><Sk className="h-5 w-14" /></div>
            </div>
            <Sk className="h-4 w-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}
