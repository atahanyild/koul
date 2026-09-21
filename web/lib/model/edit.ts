/** Small pure helpers for editing a rule list. */
import type { Rule } from "./autopilot";

/** Structural equality of two rule lists, position by position. */
export function rulesEqual(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((r, i) => ruleKey(r) === ruleKey(b[i]!));
}

/** What the router and the rows care about: everything but the local id and the inferred marks. */
export const ruleKey = (r: Rule) => JSON.stringify([r.match, r.enabled, r.cooldownSec, r.action, r.conditions]);

/** Move an item one step; returns the same array when the move is out of range. */
export function moveItem<T>(list: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Move an item to an index (drag and drop). */
export function moveTo<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/**
 * How many rows differ between what is saved and the draft: added, removed, changed, or in another position.
 * Counted by position, which is how the router reads a list.
 */
export function countChanges(saved: Rule[], draft: Rule[]): number {
  const a = saved.map(ruleKey);
  const b = draft.map(ruleKey);
  let n = Math.abs(a.length - b.length);
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) n++;
  return n;
}
