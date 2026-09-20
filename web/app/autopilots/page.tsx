"use client";

/**
 * The autopilots list. Three tabs (what is running, what is drafted, what has ended), each autopilot as a card that
 * says in one line whether any rule would run right now.
 */
import * as React from "react";
import Link from "next/link";
import { Plus, PenLine, Compass, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, EmptyState, ErrorState } from "@/components/koul/primitives";
import { RequireWallet } from "@/components/shell/connect-panel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useWallet } from "@/hooks/use-wallet";
import { useAutopilots } from "@/hooks/use-autopilots";
import { useChainAutopilots } from "@/hooks/use-portfolio";
import { useLiveValues } from "@/hooks/use-live-values";
import type { Autopilot } from "@/lib/model/autopilot";
import { AutopilotCard, AutopilotCardSkeleton } from "@/components/autopilots-list/autopilot-card";
import { useNow } from "@/components/activity/use-now";

type TabKey = "active" | "drafts" | "ended";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "drafts", label: "Drafts" },
  { key: "ended", label: "Ended" },
];

function groupAutopilots(list: Autopilot[]): Record<TabKey, Autopilot[]> {
  const rank = (s: Autopilot["status"]) => (s === "armed" ? 0 : 1);
  return {
    active: list.filter((a) => a.status === "armed" || a.status === "paused").sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt - a.createdAt),
    drafts: list.filter((a) => a.status === "draft").sort((a, b) => b.createdAt - a.createdAt),
    ended: list.filter((a) => a.status === "ended").sort((a, b) => (b.armedUntil ?? b.createdAt) - (a.armedUntil ?? a.createdAt)),
  };
}

export default function AutopilotsPage() {
  const w = useWallet();
  const { autopilots, loading, error } = useAutopilots();
  const chain = useChainAutopilots();
  const { live, loading: liveLoading } = useLiveValues();
  const now = useNow(30_000);
  const [tab, setTab] = React.useState<TabKey>("active");
  const groups = React.useMemo(() => groupAutopilots(autopilots), [autopilots]);

  const newButton = (className?: string) => (
    <Button size="lg" className={cn("min-h-11 px-4 text-[15px]", className)} nativeButton={false} render={<Link href="/autopilots/new" />}>
      <Plus data-icon="inline-start" /> New autopilot
    </Button>
  );

  return (
    <>
      <PageHeader
        eyebrow="Autopilots"
        title="Rules that run for you"
        description="Each autopilot is a short list of rules. Koul checks them every few minutes and only ever does what they say."
        actions={newButton(w.isConnected ? "max-md:hidden" : undefined)}
      />

      <RequireWallet connected={w.isConnected} initializing={w.initializing}>
        {error && !loading && (
          <ErrorState
            className="mb-5"
            title="Could not read the router"
            description={autopilots.length ? "Showing what this browser has saved until the chain answers." : error.message}
            onRetry={() => void chain.refresh()}
          />
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-5">
          <TabsList variant="line" className="h-11 w-full justify-start rounded-none border-b border-border p-0 pb-px">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="h-full flex-none gap-2 px-3 text-[15px] first:pl-1 data-active:text-foreground">
                {t.label}
                <span className={cn("num rounded-full px-1.5 py-px text-[11px] leading-4", tab === t.key ? "bg-clay-soft text-clay" : "bg-surface-2 text-muted-foreground")} aria-label={`${groups[t.key].length} ${t.label.toLowerCase()}`}>
                  {loading ? "–" : groups[t.key].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TABS.map((t) => (
            <TabsContent key={t.key} value={t.key} className="animate-rise">
              {loading ? (
                <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                  <AutopilotCardSkeleton />
                  <AutopilotCardSkeleton />
                </div>
              ) : groups[t.key].length === 0 ? (
                <TabEmpty tab={t.key} drafts={groups.drafts.length} onShowDrafts={() => setTab("drafts")} />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                  {groups[t.key].map((ap) => (
                    <AutopilotCard key={ap.id} ap={ap} live={live} liveLoading={liveLoading} now={now} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </RequireWallet>

      {(w.isConnected || true) && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-border bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6 md:hidden">
          {newButton("min-h-12 w-full")}
        </div>
      )}
    </>
  );
}

function TabEmpty({ tab, drafts, onShowDrafts }: { tab: TabKey; drafts: number; onShowDrafts: () => void }) {
  if (tab === "active") {
    return (
      <EmptyState
        icon={Compass}
        title="Nothing is running for you yet"
        description={drafts ? "You have a draft ready. Arm it and Koul starts checking its rules every few minutes." : "Write what you want in a sentence and Koul turns it into rules you can read, then arm it with Face ID."}
        action={
          drafts ? (
            <Button variant="outline" size="lg" className="min-h-11" onClick={onShowDrafts}>See drafts <span className="num text-muted-foreground">{drafts}</span></Button>
          ) : (
            <Button size="lg" className="min-h-11 px-4 text-[15px]" nativeButton={false} render={<Link href="/autopilots/new" />}><PenLine data-icon="inline-start" /> Write one in a sentence</Button>
          )
        }
      />
    );
  }
  if (tab === "drafts") {
    return (
      <EmptyState
        icon={PenLine}
        title="No drafts"
        description="Say what you want, in your words. Koul turns it into rules and shows you exactly what it filled in."
        action={<Button size="lg" className="min-h-11 px-4 text-[15px]" nativeButton={false} render={<Link href="/autopilots/new" />}><PenLine data-icon="inline-start" /> Write one in a sentence</Button>}
      />
    );
  }
  return (
    <EmptyState
      icon={Archive}
      title="Nothing has ended"
      description="An autopilot lands here when its key runs out or you stop it. Its runs stay in Activity."
    />
  );
}
