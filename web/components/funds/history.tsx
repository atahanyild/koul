"use client";

/** Every transfer that touched the wallet: lira in and out, crypto in and out, moves to and from the pools. */
import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Landmark, type LucideIcon } from "lucide-react";
import type { ActivityItem, ActivityKind } from "@/lib/data/types";
import { DemoChip, EmptyState, ErrorState, Money, Sk, TxLink } from "@/components/koul/primitives";
import { Button } from "@/components/ui/button";
import { useActivity } from "@/hooks/use-activity";
import { fmtRelative, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";

const KINDS: ActivityKind[] = ["lira_in", "lira_out", "crypto_in", "crypto_out", "supply", "withdraw"];
const ICONS: Partial<Record<ActivityKind, { icon: LucideIcon; tone: string }>> = {
  lira_in: { icon: ArrowDownLeft, tone: "bg-positive-soft text-positive" },
  crypto_in: { icon: ArrowDownLeft, tone: "bg-positive-soft text-positive" },
  lira_out: { icon: ArrowUpRight, tone: "bg-surface-2 text-foreground" },
  crypto_out: { icon: ArrowUpRight, tone: "bg-surface-2 text-foreground" },
  supply: { icon: ArrowRightLeft, tone: "bg-surface-2 text-muted-foreground" },
  withdraw: { icon: ArrowRightLeft, tone: "bg-surface-2 text-muted-foreground" },
};

export function useTransferHistory() {
  const a = useActivity();
  const items = React.useMemo(() => a.items.filter((i) => KINDS.includes(i.kind)), [a.items]);
  return { ...a, items };
}

export function HistoryAside({ source, loading }: { source: "live" | "mock"; loading: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {source === "mock" && !loading && <DemoChip />}
      <Link href="/activity" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm">All activity</Link>
    </div>
  );
}

export function TransferHistory({ onDeposit }: { onDeposit: () => void }) {
  const a = useTransferHistory();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  if (a.loading) return <HistorySkeleton />;
  if (a.error && a.items.length === 0) return <ErrorState title="Could not load your transfers" description={a.error.message} onRetry={() => void a.refresh()} />;
  if (a.items.length === 0) {
    return <EmptyState icon={Landmark} title="No transfers yet" description="Bring lira in from your bank and it lands here as USDC." action={<Button size="lg" className="min-h-11 px-4 text-[15px]" onClick={onDeposit}>Deposit lira</Button>} />;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {a.items.map((i) => <HistoryRow key={i.id} item={i} now={now} />)}
    </ul>
  );
}

function HistoryRow({ item, now }: { item: ActivityItem; now: number }) {
  const meta = ICONS[item.kind] ?? { icon: ArrowRightLeft, tone: "bg-surface-2 text-muted-foreground" };
  const Icon = meta.icon;
  const signed = item.amountUsdc !== undefined && item.amountUsdc !== 0;
  const note = item.kind === "supply" ? "to pool" : item.kind === "withdraw" ? "to wallet" : "";
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto_6rem] md:gap-x-4 md:px-5">
      <span className={cn("flex size-9 items-center justify-center rounded-full", meta.tone)} aria-hidden><Icon className="size-4" /></span>
      <div className="min-w-0">
        <div className="text-sm leading-snug">{item.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{fmtRelative(item.at, now)}</span>
          {item.reference ? <><span aria-hidden>·</span><span className="num">{item.reference}</span></> : item.detail ? <><span aria-hidden className="hidden md:inline">·</span><span className="hidden truncate md:inline">{item.detail}</span></> : null}
          {item.txHash && <><span aria-hidden className="md:hidden">·</span><TxLink hash={item.txHash} className="min-h-0 md:hidden" /></>}
        </div>
      </div>
      <div className="text-right">
        {signed ? (
          <Money value={item.amountUsdc!} signed animate={false} size="sm" className={cn("whitespace-nowrap", item.amountUsdc! > 0 && "text-positive")} />
        ) : item.amountTry ? (
          <span className="num text-sm text-muted-foreground">{fmtTry(item.amountTry)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{note}</span>
        )}
        {signed && item.amountTry ? <div className="num text-[11px] text-muted-foreground">{fmtTry(item.amountTry)}</div> : null}
      </div>
      <div className="hidden text-right md:block">
        {item.txHash ? <TxLink hash={item.txHash} /> : <span className="text-xs text-muted-foreground">—</span>}
      </div>
    </li>
  );
}

export function HistorySkeleton() {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card" aria-busy>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 md:px-5">
          <Sk className="size-9 rounded-full" />
          <div className="flex-1"><Sk className="mb-2 h-3.5 w-2/3" /><Sk className="h-3 w-1/3" /></div>
          <Sk className="h-4 w-20" />
        </li>
      ))}
    </ul>
  );
}
