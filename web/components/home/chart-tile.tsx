"use client";

import * as React from "react";
import { Label, Sk, TextSegmented, Tile, TileLabel } from "@/components/signal";
import { MOCK_HISTORY, mockedHistory, type HistoryPoint } from "@/lib/mock";

type Range = "7D" | "30D" | "ALL";

function Line({ points }: { points: HistoryPoint[] }) {
  const w = 100;
  const h = 40;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p.v - min) / span) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Balance over time">
      <polyline points={d} fill="none" stroke="var(--lime)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The balance line. There is no history source yet, so it draws only from the mock flag; otherwise it says so. */
export function ChartTile({ balance, loading, className }: { balance: number | null; loading: boolean; className?: string }) {
  const [range, setRange] = React.useState<Range>("30D");
  const days = range === "7D" ? 7 : range === "30D" ? 30 : 60;
  const mocked = MOCK_HISTORY && balance !== null && balance > 0 ? mockedHistory(balance, days) : null;
  const empty = !loading && (balance === null || balance <= 0);
  return (
    <Tile className={className}>
      <div className="flex items-center justify-between">
        <TileLabel>Balance</TileLabel>
        <TextSegmented label="Range" value={range} onChange={setRange} options={[{ value: "7D", label: "7D" }, { value: "30D", label: "30D" }, { value: "ALL", label: "ALL" }]} />
      </div>
      <div className="mt-4 flex h-24 items-center justify-center">
        {loading ? <Sk className="h-24 w-full rounded-xl" /> : mocked ? <Line points={mocked.series} /> : (
          <div className="flex w-full flex-col items-center gap-3">
            <Label>{empty ? "Deposit to start the chart" : "No chart yet"}</Label>
            <span aria-hidden className="w-full border-t border-dashed border-line" />
          </div>
        )}
      </div>
    </Tile>
  );
}
