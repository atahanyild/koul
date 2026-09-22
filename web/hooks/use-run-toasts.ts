"use client";

/** Demo: a toast with the transaction link whenever a new autopilot run shows up in Activity. */
import { useEffect, useRef } from "react";
import { toastTx } from "./use-passkey-action";
import type { ActivityRow } from "./use-activity";

export function useRunToasts(rows: ActivityRow[], enabled: boolean) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const runs = rows.filter((r) => r.kind === "run" && r.txHash);
    const newest = runs[0]?.at ?? null;
    if (seen.current === null) { seen.current = newest ?? 0; return; }
    for (const r of runs) {
      if (r.at > seen.current) toastTx(`Autopilot ran: ${r.title}`, r.txHash!, r.amount !== undefined ? `${Math.abs(r.amount).toFixed(2)} USDC` : undefined);
    }
    if (newest !== null && newest > seen.current) seen.current = newest;
  }, [rows, enabled]);
}
