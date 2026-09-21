"use client";

import * as React from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { bestPool, useFx, usePools } from "@/hooks/use-market";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useActivity } from "@/hooks/use-activity";
import { BalanceTile } from "@/components/home/balance-tile";
import { IdleTile, PnlTile } from "@/components/home/pnl-idle";
import { ChartTile } from "@/components/home/chart-tile";
import { AutopilotTile } from "@/components/home/autopilot-tile";
import { PositionsTile } from "@/components/home/positions-tile";
import { ActivityTile } from "@/components/home/activity-tile";
import { PutToWorkDialog } from "@/components/home/put-to-work";

/** A clock that ticks once a minute, for the "2H ago" labels; the number lives in state so renders stay pure. */
function useMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function HomePage() {
  const pf = usePortfolio();
  const fx = useFx();
  const pools = usePools();
  const ap = useAutopilotLive();
  const activity = useActivity();
  const now = useMinute();
  const [putOpen, setPutOpen] = React.useState(false);

  const loaded = pf.loaded;
  const supplied = pf.positions.supplied.A + pf.positions.supplied.B;
  const debt = pf.positions.borrowed.A + pf.positions.borrowed.B;
  const balance = loaded ? pf.positions.idleUsdc + supplied - debt : null;
  const lira = balance !== null && !fx.loading && fx.fx.tryPerUsd > 0 ? balance * fx.fx.tryPerUsd : balance === 0 ? 0 : null;
  const target = bestPool(pools.pools);
  const idle = loaded ? pf.positions.idleUsdc : null;

  return (
    <div className="grid gap-4 md:gap-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-5">
        <BalanceTile balance={balance} lira={lira} loading={!loaded} />
        <div className="grid gap-4 md:gap-5">
          <div className="grid grid-cols-2 gap-4 md:gap-5">
            <PnlTile balance={balance} loading={!loaded} />
            <IdleTile idle={idle} loading={!loaded} target={target ? `Hub ${target.hub}` : null} onPutToWork={() => setPutOpen(true)} busy={false} />
          </div>
          <ChartTile balance={balance} loading={!loaded} className="flex-1" />
        </div>
      </div>
      <AutopilotTile ap={ap} now={now} />
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        <PositionsTile positions={pf.positions} pools={pools.pools} loading={!loaded} empty={loaded && supplied === 0 && debt === 0 && pf.positions.idleUsdc === 0} />
        <ActivityTile rows={activity.rows} loading={activity.loading} now={now} />
      </div>
      <PutToWorkDialog open={putOpen} onOpenChange={setPutOpen} idle={idle ?? 0} pool={target} />
    </div>
  );
}
