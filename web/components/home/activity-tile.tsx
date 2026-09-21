"use client";

import Link from "next/link";
import { EmptyState, Loadable, Row, RowList, SkRows, Tile, TileLabel } from "@/components/signal";
import type { ActivityRow } from "@/hooks/use-activity";
import { agoShort } from "@/lib/model/labels";
import { cn } from "@/lib/utils";

/** The three most recent moves. The tile links to Activity. */
export function ActivityTile({ rows, loading, now, className }: { rows: ActivityRow[]; loading: boolean; now: number; className?: string }) {
  const recent = rows.slice(0, 3);
  return (
    <Link href="/activity" className={cn("block rounded-[var(--radius-tile)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime", className)} aria-label="Activity">
      <Tile className="h-full transition-colors hover:bg-surface-2/60">
        <TileLabel>Activity</TileLabel>
        <Loadable loading={loading} skeleton={<SkRows rows={3} />} className="mt-2">
          {recent.length === 0 ? <EmptyState title="Nothing yet" line="Deposits, withdrawals and autopilot moves show up here" /> : (
            <RowList>
              {recent.map((r) => (
                <Row key={r.id} title={r.title} value={<span className={cn(r.who === "auto" ? "text-lime" : "text-muted")}>{r.who.toUpperCase()} · {agoShort(r.at, now)}</span>} />
              ))}
            </RowList>
          )}
        </Loadable>
      </Tile>
    </Link>
  );
}
