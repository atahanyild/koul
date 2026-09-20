"use client";

/**
 * Small local stores the autopilot pages need beyond the shared draft store:
 *  - pending edits to an armed or paused autopilot (they wait until it is armed again),
 *  - phrases the sentence parser could not place, so the autopilot page can say so.
 */
import { useCallback } from "react";
import { createLocalStore } from "@/lib/data/store";
import type { Autopilot, Rule } from "@/lib/model/autopilot";

const pendingStore = createLocalStore<Record<string, Autopilot>>("koul.autopilot.pending", {});
const unplacedStore = createLocalStore<Record<string, string[]>>("koul.autopilot.unplaced", {});

function without<T>(map: Record<string, T>, id: string): Record<string, T> {
  if (!(id in map)) return map;
  const next = { ...map };
  delete next[id];
  return next;
}

/** Edits to an autopilot whose rules live on-chain (or in the sample story) until the user arms it again. */
export function usePendingEdits(id: string) {
  const [all, setAll] = pendingStore.use();
  const set = useCallback((ap: Autopilot) => setAll((prev) => ({ ...prev, [id]: ap })), [id, setAll]);
  const clear = useCallback(() => setAll((prev) => without(prev, id)), [id, setAll]);
  return { pending: all[id] ?? null, set, clear };
}

export const clearPendingEdits = (id: string) => pendingStore.set((prev) => without(prev, id));

/** What the parser could not act on, remembered per autopilot so the page can show it once. */
export function useUnplaced(id: string) {
  const [all, setAll] = unplacedStore.use();
  const clear = useCallback(() => setAll((prev) => without(prev, id)), [id, setAll]);
  return { unplaced: all[id] ?? [], clear };
}

export const rememberUnplaced = (id: string, phrases: string[]) => {
  if (phrases.length) unplacedStore.set((prev) => ({ ...prev, [id]: phrases }));
};

/** Structural equality of two rule lists, ignoring nothing that the router or the cards care about. */
export function rulesEqual(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  const key = (r: Rule) => JSON.stringify([r.id, r.name, r.match, r.enabled, r.cooldownSec, r.action, r.conditions]);
  return a.every((r, i) => key(r) === key(b[i]));
}

/** Move an item one step; returns the same array when the move is out of range. */
export function moveItem<T>(list: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
