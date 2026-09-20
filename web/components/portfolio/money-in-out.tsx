"use client";

/** Lira in, lira out, and the last time either happened. */
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Card, Sk, TxLink } from "@/components/koul/primitives";
import { Button } from "@/components/ui/button";
import type { ActivityItem } from "@/lib/data/types";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyInOut({ items, loading, className }: { items: ActivityItem[]; loading: boolean; className?: string }) {
  const last = items.find((i) => i.kind === "lira_in" || i.kind === "lira_out");
  return (
    <Card className={cn("flex min-w-0 flex-col p-5 sm:p-6", className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Money in and out</div>
      <p className="mt-1 text-sm text-muted-foreground">Lira moves through the bank partner. USDC lands in your wallet.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button size="lg" className="min-h-11 flex-1 text-[15px]" nativeButton={false} render={<Link href="/funds" />}>
          <ArrowDownToLine data-icon="inline-start" /> Deposit lira
        </Button>
        <Button size="lg" variant="outline" className="min-h-11 flex-1 text-[15px]" nativeButton={false} render={<Link href="/funds" />}>
          <ArrowUpFromLine data-icon="inline-start" /> Withdraw to lira
        </Button>
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        {loading ? (
          <Sk className="h-3 w-52 max-w-full" />
        ) : last ? (
          <>
            <span className="min-w-0">
              Last: <span className="text-foreground">{last.title}</span> · {fmtRelative(last.at)}
            </span>
            {last.txHash && <TxLink hash={last.txHash} />}
          </>
        ) : (
          <span>No lira transfers yet.</span>
        )}
      </div>
    </Card>
  );
}
