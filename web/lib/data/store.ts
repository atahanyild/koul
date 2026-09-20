"use client";

/**
 * A tiny shared cache for polled reads. Components that ask for the same key share one fetch and one timer,
 * and re-render together. No library, ~90 lines, enough for a handful of RPC reads.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

interface Snapshot<T> {
  data: T | undefined;
  error: Error | null;
  updatedAt: number;
  loading: boolean;
}
interface Entry<T> {
  snap: Snapshot<T>;
  inflight: Promise<void> | null;
  listeners: Set<() => void>;
}

const entries = new Map<string, Entry<unknown>>();
const EMPTY: Snapshot<never> = { data: undefined, error: null, updatedAt: 0, loading: false };

function entry<T>(key: string): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined;
  if (!e) {
    e = { snap: EMPTY as Snapshot<T>, inflight: null, listeners: new Set() };
    entries.set(key, e as Entry<unknown>);
  }
  return e;
}

function set<T>(e: Entry<T>, patch: Partial<Snapshot<T>>) {
  e.snap = { ...e.snap, ...patch };
  e.listeners.forEach((l) => l());
}

export async function refreshKey<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  const e = entry<T>(key);
  if (e.inflight) return e.inflight;
  set(e, { loading: true });
  e.inflight = fetcher()
    .then((data) => set(e, { data, error: null, updatedAt: Date.now() }))
    .catch((err) => set(e, { error: err instanceof Error ? err : new Error(String(err)) }))
    .finally(() => { e.inflight = null; set(e, { loading: false }); });
  return e.inflight;
}

/** Drop cached data for every key with this prefix so the next subscriber refetches. */
export function invalidate(prefix: string) {
  for (const [k, e] of entries) if (k.startsWith(prefix)) set(e, { updatedAt: 0 });
}

/** Push a value into the cache directly (optimistic updates, local stores). */
export function seed<T>(key: string, data: T) {
  set(entry<T>(key), { data, error: null, updatedAt: Date.now(), loading: false });
}

export interface PollState<T> {
  data: T | undefined;
  error: Error | null;
  /** True only before the first successful read. */
  loading: boolean;
  /** True while a refresh is in flight after data exists. */
  refreshing: boolean;
  updatedAt: number;
  refresh: () => Promise<void>;
}

/**
 * Subscribe to a polled read. A null key or `enabled=false` never fetches. `deps` re-fetch when they change
 * (a tx epoch, an address).
 */
export function usePoll<T>(key: string | null, fetcher: () => Promise<T>, opts: { intervalMs?: number; enabled?: boolean; deps?: unknown[] } = {}): PollState<T> {
  const { intervalMs = 0, enabled = true } = opts;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const k = key ?? "__disabled__";
  const subscribe = useCallback((cb: () => void) => { const e = entry<T>(k); e.listeners.add(cb); return () => { e.listeners.delete(cb); }; }, [k]);
  const getSnap = useCallback(() => entry<T>(k).snap, [k]);
  const snap = useSyncExternalStore(subscribe, getSnap, getSnap);
  const depsKey = JSON.stringify(opts.deps ?? [], (_, v) => (typeof v === "bigint" ? v.toString() : v));

  useEffect(() => {
    if (!key || !enabled) return;
    let cancelled = false;
    const run = () => { if (!cancelled) void refreshKey(key, () => fetcherRef.current()); };
    const e = entry<T>(key);
    const age = Date.now() - e.snap.updatedAt;
    if (e.snap.data === undefined || age > Math.max(intervalMs, 1500)) run();
    if (!intervalMs) return () => { cancelled = true; };
    const t = setInterval(run, intervalMs);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, intervalMs, depsKey]);

  const refresh = useCallback(() => (key ? refreshKey(key, () => fetcherRef.current()) : Promise.resolve()), [key]);
  return { data: snap.data, error: snap.error, loading: snap.loading && snap.data === undefined, refreshing: snap.loading && snap.data !== undefined, updatedAt: snap.updatedAt, refresh };
}

/** A tiny localStorage-backed store with cross-component reactivity, for demo mode and local drafts. */
export function createLocalStore<T>(storageKey: string, initial: T) {
  let value: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) value = JSON.parse(raw) as T;
    } catch { /* ignore */ }
  };
  const get = () => { load(); return value; };
  const setValue = (next: T | ((prev: T) => T)) => {
    load();
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    try { window.localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* ignore */ }
    listeners.forEach((l) => l());
  };
  const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
  const use = (): [T, (next: T | ((prev: T) => T)) => void] => {
    const v = useSyncExternalStore(subscribe, get, () => initial);
    return [v, setValue];
  };
  return { get, set: setValue, subscribe, use };
}
