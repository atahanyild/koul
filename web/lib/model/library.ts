/**
 * The library: rule sets a person keeps in this browser under a name, and the link form of a set so it can be
 * handed to someone else. A set is the rules only; ids and the marks Koul inferred are dropped on the way in
 * and fresh ids are minted on the way out, so a loaded set is always a new draft.
 */
import { z } from "zod";
import { createLocalStore } from "@/lib/data/store";
import { makeRule, newId, type Rule } from "./autopilot";

export interface LibraryEntry {
  id: string;
  name: string;
  rules: Rule[];
  savedAt: number;
}

export const library = createLocalStore<LibraryEntry[]>("koul.library", []);
export const MAX_NAME = 40;

const conditionSchema = z.object({
  kind: z.enum(["rate_gap", "pool_rate", "health_factor", "fx_price", "idle_usdc"]),
  comparator: z.enum(["gte", "lte"]),
  value: z.number().finite(),
  pool: z.enum(["A", "B"]).optional(),
});
const actionSchema = z.object({
  kind: z.enum(["supply_from_wallet", "move_to_best_pool", "repay_from_wallet", "withdraw_to_wallet"]),
  amount: z.union([z.literal("all"), z.number().positive().finite(), z.object({ percent: z.number().int().min(1).max(100) })]),
  pool: z.enum(["A", "B"]).optional(),
});
const portableRule = z.object({
  name: z.string().max(60).optional(),
  conditions: z.array(conditionSchema).min(1).max(3),
  match: z.enum(["all", "any"]).optional(),
  action: actionSchema,
  cooldownSec: z.number().int().positive(),
  enabled: z.boolean().optional(),
});
const portableSet = z.object({ v: z.literal(1), name: z.string().max(MAX_NAME).optional(), rules: z.array(portableRule).min(1).max(32) });
type PortableRule = z.infer<typeof portableRule>;

/** A rule with nothing local in it: no id, no inferred marks. */
export function portable(r: Rule): PortableRule {
  return { name: r.name, conditions: r.conditions, match: r.match, action: r.action, cooldownSec: r.cooldownSec, enabled: r.enabled };
}

/** A fresh draft rule from a portable one. */
export function materialize(p: PortableRule): Rule {
  return makeRule({ id: newId(), name: p.name ?? "Rule", conditions: p.conditions, match: p.match ?? "all", action: p.action, cooldownSec: p.cooldownSec, enabled: p.enabled ?? true, inferred: [] });
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The rules as one URL-safe token. */
export function encodeRules(rules: Rule[], name?: string): string {
  return toBase64Url(JSON.stringify({ v: 1, name, rules: rules.map(portable) }));
}

/** The rules back from a token, as new draft rules, or null when the token is not one of ours. */
export function decodeRules(token: string): { name: string | null; rules: Rule[] } | null {
  try {
    const parsed = portableSet.safeParse(JSON.parse(fromBase64Url(token)));
    if (!parsed.success) return null;
    return { name: parsed.data.name ?? null, rules: parsed.data.rules.map(materialize) };
  } catch {
    return null;
  }
}

/** The share link for a set: the Autopilot page with the token in `load`. */
export function shareLink(origin: string, rules: Rule[], name?: string): string {
  return `${origin}/autopilot?load=${encodeRules(rules, name)}`;
}

/** A name that is not taken yet: "Lira shield", then "Lira shield 2", and so on. */
export function uniqueName(name: string, taken: string[]): string {
  const base = name.trim().slice(0, MAX_NAME) || "Autopilot";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, MAX_NAME - 1 - String(i).length)} ${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** Add a set to the library under a unique name; returns the entry. */
export function addToLibrary(entries: LibraryEntry[], name: string, rules: Rule[]): { entries: LibraryEntry[]; entry: LibraryEntry } {
  const entry: LibraryEntry = { id: newId("lib"), name: uniqueName(name, entries.map((e) => e.name)), rules: rules.map((r) => materialize(portable(r))), savedAt: Date.now() };
  return { entries: [entry, ...entries], entry };
}
