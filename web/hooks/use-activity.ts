"use client";

/** Everything that touched the wallet, newest first. Router `Fired` events live; the sample story in demo mode. */
import { useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { usePoll } from "@/lib/data/store";
import { firedToActivity, readFired } from "@/lib/data/live";
import { mockActivity } from "@/lib/data/mock";
import type { ActivityItem, Source } from "@/lib/data/types";
import { useDemoMode } from "./use-demo-mode";

export interface ActivityState { items: ActivityItem[]; source: Source; loading: boolean; error: Error | null; connected: boolean; refresh: () => Promise<void> }

export function useActivity(): ActivityState {
  const { isConnected, address, txEpoch } = usePasskeyWallet();
  const [demo] = useDemoMode();
  const p = usePoll(isConnected && address ? `fired:${address}` : null, () => readFired(address!), { intervalMs: 20_000, enabled: isConnected, deps: [txEpoch] });
  return useMemo(() => {
    if (!isConnected) return { items: demo ? mockActivity() : [], source: "mock", loading: false, error: null, connected: false, refresh: p.refresh };
    if (p.data && p.data.length) return { items: p.data.map(firedToActivity), source: "live", loading: false, error: null, connected: true, refresh: p.refresh };
    if (p.loading || (!p.error && p.updatedAt === 0)) return { items: [], source: "live", loading: true, error: null, connected: true, refresh: p.refresh };
    return { items: demo ? mockActivity() : [], source: demo ? "mock" : "live", loading: false, error: p.error, connected: true, refresh: p.refresh };
  }, [isConnected, demo, p.data, p.loading, p.error, p.updatedAt, p.refresh]);
}
