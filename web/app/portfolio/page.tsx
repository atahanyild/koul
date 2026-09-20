"use client";

/**
 * Portfolio: everything the wallet holds, in USDC and in lira. Hero total, four tiles, the positions in each pool,
 * and money in and out. Needs a wallet; shows the sample story as a preview when there is none.
 */
import Link from "next/link";
import { ArrowDownToLine } from "lucide-react";
import { PageHeader, DemoChip, EmptyState, ErrorState, Sk } from "@/components/koul/primitives";
import { RequireWallet } from "@/components/shell/connect-panel";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useFx, usePools } from "@/hooks/use-market";
import { useAutopilots } from "@/hooks/use-autopilots";
import { useActivity } from "@/hooks/use-activity";
import { PortfolioHero, PortfolioTiles, TilesSkeleton } from "@/components/portfolio/summary";
import { PositionsSection, PositionsSkeleton } from "@/components/portfolio/positions";
import { MoneyInOut } from "@/components/portfolio/money-in-out";

export default function PortfolioPage() {
  const w = useWallet();
  const pf = usePortfolio();
  const fx = useFx();
  const pools = usePools();
  const aps = useAutopilots();
  const activity = useActivity();
  const armed = aps.autopilots.find((a) => a.status === "armed") ?? null;
  const showDemo = w.isConnected && !pf.loading && pf.source === "mock";

  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Everything you hold" chips={showDemo ? <DemoChip /> : null} />
      <RequireWallet connected={w.isConnected} initializing={w.initializing}>
        {pf.error && !pf.loading && (
          <ErrorState className="mb-6" title="Could not read your positions" description={pf.empty ? "Check your connection and try again." : "Showing the last known numbers until the next read succeeds."} onRetry={() => void pf.refresh()} />
        )}

        {pf.loading ? (
          <>
            <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]" aria-busy>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <Sk className="mb-4 h-3 w-12" />
                <Sk className="mb-3 h-12 w-56 max-w-full" />
                <Sk className="mb-6 h-4 w-40" />
                <Sk className="h-4 w-64 max-w-full" />
              </div>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <Sk className="mb-3 h-3 w-32" />
                <Sk className="mb-5 h-4 w-56 max-w-full" />
                <div className="flex gap-2"><Sk className="h-11 flex-1" /><Sk className="h-11 flex-1" /></div>
              </div>
            </div>
            <div className="mb-8 sm:mb-10"><TilesSkeleton /></div>
            <PositionsSkeleton />
          </>
        ) : pf.empty ? (
          <EmptyState
            title="Nothing here yet"
            description="Deposit lira from your bank and it arrives here as USDC, ready to earn."
            action={
              <Button size="lg" className="min-h-12 px-5 text-[15px]" nativeButton={false} render={<Link href="/funds" />}>
                <ArrowDownToLine data-icon="inline-start" /> Deposit lira
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
              <PortfolioHero positions={pf.positions} fx={fx.fx} fxLive={fx.source === "live"} pools={pools.pools} poolsLoading={pools.loading} />
              <MoneyInOut items={activity.items} loading={activity.loading} />
            </div>
            <div className="mb-8 sm:mb-10">
              <PortfolioTiles positions={pf.positions} health={pf.health} />
            </div>
            <PositionsSection positions={pf.positions} pools={pools.pools} poolsLoading={pools.loading} managedBy={armed} />
          </>
        )}
      </RequireWallet>
    </>
  );
}
