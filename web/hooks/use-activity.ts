"use client";

/** Everything the router did for the wallet, newest first, from its `Fired` events. */
import { useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { usePoll } from "@/lib/data/store";
import { firedToActivity, readFired } from "@/lib/data/live";
import type { ActivityItem } from "@/lib/data/types";

export interface ActivityState { items: ActivityItem[]; loading: boolean; error: Error | null; connected: boolean; refresh: () => Promise<void> }

export function useActivity(): ActivityState {
  const { isConnected, address, txEpoch } = usePasskeyWallet();
  const p = usePoll(isConnected && address ? `fired:${address}` : null, () => readFired(address!), { intervalMs: 20_000, enabled: isConnected, deps: [txEpoch] });
  return useMemo(() => {
    if (!isConnected) return { items: [], loading: false, error: null, connected: false, refresh: p.refresh };
    const loading = p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
    return { items: (p.data ?? []).map(firedToActivity), loading, error: p.error, connected: true, refresh: p.refresh };
  }, [isConnected, p.data, p.loading, p.error, p.updatedAt, p.refresh]);
}
