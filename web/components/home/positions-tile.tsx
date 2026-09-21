"use client";

import { EmptyState, Row, RowList, SkRows, Tile, TileLabel } from "@/components/signal";
import { fmtPct, fmtUsdc } from "@/lib/format";
import type { Pool, Positions } from "@/lib/data/types";
import { POOLS, type PoolId } from "@/lib/model/autopilot";

/** Where the USDC sits right now: one row per hub with its APY, the idle wallet, and any debt. */
export function positionRows(positions: Positions, pools: Pool[]): { key: string; title: string; value: string }[] {
  const rows: { key: string; title: string; value: string; sort: number }[] = [];
  for (const id of ["A", "B"] as PoolId[]) {
    const supplied = positions.supplied[id];
    const pool = pools.find((p) => p.id === id);
    const rate = pool ? ` · ${fmtPct(pool.supplyApy)}` : "";
    rows.push({ key: `hub-${id}`, title: `Hub ${POOLS[id].hub}${rate}`, value: fmtUsdc(supplied), sort: supplied });
    const debt = positions.borrowed[id];
    if (debt > 0) rows.push({ key: `debt-${id}`, title: `Hub ${POOLS[id].hub} · debt`, value: `−${fmtUsdc(debt)}`, sort: -1 });
  }
  rows.sort((a, b) => b.sort - a.sort);
  rows.push({ key: "wallet", title: "Wallet · idle", value: fmtUsdc(positions.idleUsdc), sort: 0 });
  return rows;
}

export function PositionsTile({ positions, pools, loading, empty, className }: { positions: Positions; pools: Pool[]; loading: boolean; empty: boolean; className?: string }) {
  return (
    <Tile className={className}>
      <TileLabel>Positions</TileLabel>
      <div className="mt-2">
        {loading ? <SkRows rows={3} /> : empty ? <EmptyState title="No positions yet" line="Deposit, then put it to work" /> : (
          <RowList>
            {positionRows(positions, pools).map((r) => <Row key={r.key} title={r.title} value={r.value} />)}
          </RowList>
        )}
      </div>
    </Tile>
  );
}
