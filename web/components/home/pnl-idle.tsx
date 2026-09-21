"use client";

import * as React from "react";
import { Label, PillButton, Sk, Tile, TileLabel } from "@/components/signal";
import { fmtUsdc } from "@/lib/format";
import { MOCK_HISTORY, mockedHistory } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** All-time PNL: a dash until there is a history source (see docs/internal/ui-feasibility.md), mocked behind the flag. */
export function PnlTile({ balance, loading }: { balance: number | null; loading: boolean }) {
  const mocked = MOCK_HISTORY && balance !== null && balance > 0 ? mockedHistory(balance, 30) : null;
  return (
    <Tile className="flex min-h-[196px] flex-col">
      <TileLabel>PNL</TileLabel>
      <div className="mt-auto">
        {loading ? <Sk className="h-12 w-32 rounded-xl" /> : mocked ? (
          <div className={cn("t-value num", mocked.pnl >= 0 ? "text-lime" : "text-danger")}>{mocked.pnl >= 0 ? "+" : "−"}{fmtUsdc(Math.abs(mocked.pnl))}</div>
        ) : (
          <div className="flex h-12 items-center"><span aria-label="No value" className="block h-1.5 w-12 rounded-full bg-dim" /></div>
        )}
        <div className="mt-4">
          {loading ? <Sk className="h-3.5 w-24" /> : mocked ? <Label>{mocked.pnlPct >= 0 ? "+" : "−"}{Math.abs(mocked.pnlPct).toFixed(2)}% · all time</Label> : <Label>No history yet</Label>}
        </div>
      </div>
    </Tile>
  );
}

/** Idle USDC in the wallet, with "Put to work" when there is at least 1 USDC (the router's minimum move). */
export function IdleTile({ idle, loading, target, onPutToWork, busy }: { idle: number | null; loading: boolean; target: string | null; onPutToWork: () => void; busy: boolean }) {
  const can = (idle ?? 0) >= 1 && target !== null;
  return (
    <Tile className="flex min-h-[196px] flex-col">
      <TileLabel>Idle</TileLabel>
      <div className="mt-auto">
        {loading || idle === null ? <Sk className="h-12 w-32 rounded-xl" /> : <div className="t-value num">{fmtUsdc(idle)}</div>}
        <div className="mt-4 min-h-11">
          {loading ? <Sk className="h-11 w-32 rounded-full" /> : can ? (
            <PillButton variant="ghost" size="md" onClick={onPutToWork} disabled={busy} aria-busy={busy}>{busy ? "Confirm with your passkey" : "Put to work"}</PillButton>
          ) : (
            <Label>Nothing idle</Label>
          )}
        </div>
      </div>
    </Tile>
  );
}
