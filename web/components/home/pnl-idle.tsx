"use client";

import * as React from "react";
import { FitValue, fitValueClass, Label, Loadable, PillButton, Sk, Tile, TileLabel } from "@/components/signal";
import { useCountUp } from "@/lib/count-up";
import { fmtUsdc } from "@/lib/format";
import { MOCK_HISTORY, mockedHistory } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** All-time PNL: a dash until there is a history source (see docs/internal/ui-feasibility.md), mocked behind the flag. */
export function PnlTile({ balance, loading }: { balance: number | null; loading: boolean }) {
  const mocked = MOCK_HISTORY && balance !== null && balance > 0 ? mockedHistory(balance, 30) : null;
  const pnl = useCountUp(mocked ? mocked.pnl : null);
  const skeleton = <><Sk className="h-9 w-28 rounded-xl md:h-12 md:w-32" /><Sk className="mt-4 h-3.5 w-24" /></>;
  return (
    <Tile className="flex min-h-[196px] flex-col">
      <TileLabel>PNL</TileLabel>
      <Loadable loading={loading} skeleton={skeleton} className="mt-auto">
        {mocked && pnl !== null ? (
          <div className={cn(fitValueClass(`${pnl >= 0 ? "+" : "−"}${fmtUsdc(Math.abs(pnl))}`), mocked.pnl >= 0 ? "text-accent-text" : "text-danger")}>{pnl >= 0 ? "+" : "−"}{fmtUsdc(Math.abs(pnl))}</div>
        ) : (
          <div className="flex h-9 items-center md:h-12"><span aria-label="No value" className="block h-1.5 w-12 rounded-full bg-dim" /></div>
        )}
        <div className="mt-4">
          {mocked ? <Label>{mocked.pnlPct >= 0 ? "+" : "−"}{Math.abs(mocked.pnlPct).toFixed(2)}% · all time</Label> : <Label>No history yet</Label>}
        </div>
      </Loadable>
    </Tile>
  );
}

/** Idle USDC in the wallet, with "Put to work" when there is at least 1 USDC (the router's minimum move). */
export function IdleTile({ idle, loading, target, onPutToWork, busy }: { idle: number | null; loading: boolean; target: string | null; onPutToWork: () => void; busy: boolean }) {
  const can = (idle ?? 0) >= 1 && target !== null;
  const shown = useCountUp(loading ? null : idle);
  const skeleton = <><Sk className="h-9 w-28 rounded-xl md:h-12 md:w-32" /><Sk className="mt-4 h-11 w-32 rounded-full" /></>;
  return (
    <Tile className="flex min-h-[196px] flex-col">
      <TileLabel>Idle</TileLabel>
      <Loadable loading={loading || idle === null} skeleton={skeleton} className="mt-auto">
        <FitValue text={fmtUsdc(shown ?? idle ?? 0)} />
        <div className="mt-4 min-h-11">
          {can ? (
            <PillButton variant="ghost" size="md" onClick={onPutToWork} disabled={busy} aria-busy={busy}>{busy ? "Confirm with your passkey" : "Put to work"}</PillButton>
          ) : (
            <Label>Nothing idle</Label>
          )}
        </div>
      </Loadable>
    </Tile>
  );
}
