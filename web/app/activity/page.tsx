"use client";

/**
 * What happened: every run, key change and transfer for this wallet, newest first. Live rows come from the router's
 * `Fired` events; the sample story fills in while the chain has nothing for this wallet.
 */
import * as React from "react";
import Link from "next/link";
import { RefreshCw, Activity as ActivityIcon, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState, ErrorState, LiveDot } from "@/components/koul/primitives";
import { RequireWallet } from "@/components/shell/connect-panel";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { useActivity } from "@/hooks/use-activity";
import { ActivityGroups, ActivitySkeleton, FilterChips } from "@/components/activity/activity-list";
import { filterKinds, FILTERS, type FilterKey } from "@/components/activity/kinds";
import { useNow } from "@/components/activity/use-now";

export default function ActivityPage() {
  const w = useWallet();
  const { items, loading, error, refresh } = useActivity();
  const now = useNow(30_000);
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [refreshing, setRefreshing] = React.useState(false);

  const counts = React.useMemo(() => {
    const out = { all: items.length, autopilot: 0, money: 0 } as Record<FilterKey, number>;
    for (const f of FILTERS) if (f.kinds) out[f.key] = items.filter((i) => f.kinds!.includes(i.kind)).length;
    return out;
  }, [items]);
  const visible = React.useMemo(() => {
    const kinds = filterKinds(filter);
    return kinds ? items.filter((i) => kinds.includes(i.kind)) : items;
  }, [items, filter]);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await Promise.all([refresh(), new Promise((r) => setTimeout(r, 650))]); }
    finally { setRefreshing(false); }
  };

  const isLive = !loading && !error && items.length > 0;
  const filterLabel = FILTERS.find((f) => f.key === filter)?.label.toLowerCase() ?? "";

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="What happened"
        description="Every run, key change and transfer, in plain words, each with its transaction on Stellar."
        chips={
          isLive ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground" role="status"><LiveDot /> Live from the router</span>
          ) : null
        }
        actions={
          <Button variant="outline" size="lg" className="min-h-11 px-4" onClick={() => void onRefresh()} disabled={refreshing || loading} aria-busy={refreshing}>
            <RefreshCw data-icon="inline-start" className={cn(refreshing && "animate-spin")} aria-hidden />
            <span aria-live="polite">{refreshing ? "Refreshing" : "Refresh"}</span>
          </Button>
        }
      />

      <RequireWallet connected={w.isConnected} initializing={w.initializing}>
        {error && !loading && (
          <ErrorState
            className="mb-5"
            title="Could not reach the router"
            description={items.length ? "Showing sample data until it answers." : error.message}
            onRetry={() => void onRefresh()}
          />
        )}

        {loading ? (
          <ActivitySkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ActivityIcon}
            title="Nothing yet"
            description="Arm an autopilot and Koul will list every run here."
            action={<Button size="lg" className="min-h-11 px-4 text-[15px]" nativeButton={false} render={<Link href="/autopilots" />}><Compass data-icon="inline-start" /> See autopilots</Button>}
          />
        ) : (
          <>
            <FilterChips value={filter} onChange={setFilter} counts={counts} className="mb-5" />
            {visible.length === 0 ? (
              <EmptyState
                title={`Nothing under ${filterLabel}`}
                description="Other kinds of activity are listed under the other filters."
                action={<Button variant="outline" size="lg" className="min-h-11" onClick={() => setFilter("all")}>Show all</Button>}
              />
            ) : (
              <ActivityGroups items={visible} now={now} />
            )}
          </>
        )}
      </RequireWallet>
    </>
  );
}
