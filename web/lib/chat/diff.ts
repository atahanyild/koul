/**
 * What a chat edit changed, for the "CHANGED · UNDO" marks and the one-line confirmation: the rules whose content
 * differs, and for a changed level the old and new value in the compact voice of the row.
 */
import type { Rule } from "@/lib/model/autopilot";
import { ruleKey } from "@/lib/model/edit";
import { conditionCompact } from "@/lib/model/labels";

export interface RuleChange {
  id: string;
  /** 1-based position in the new list. */
  position: number;
  kind: "added" | "changed" | "removed";
  /** For a changed first condition: the old and new compact text, e.g. "USD/TRY > 50.00" → "USD/TRY > 51.00". */
  before?: string;
  after?: string;
  /** Just the level: "50.00" → "51.00", when only the level moved. */
  fromValue?: string;
  toValue?: string;
}

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function diffRules(before: Rule[], after: Rule[]): RuleChange[] {
  const out: RuleChange[] = [];
  const prev = new Map(before.map((r) => [r.id, r]));
  after.forEach((r, i) => {
    const b = prev.get(r.id);
    if (!b) { out.push({ id: r.id, position: i + 1, kind: "added" }); return; }
    if (ruleKey(b) === ruleKey(r)) return;
    const c: RuleChange = { id: r.id, position: i + 1, kind: "changed" };
    const bc = b.conditions[0];
    const ac = r.conditions[0];
    if (bc && ac) {
      c.before = conditionCompact(bc);
      c.after = conditionCompact(ac);
      if (bc.kind === ac.kind && bc.comparator === ac.comparator && bc.value !== ac.value) { c.fromValue = n2(bc.value); c.toValue = n2(ac.value); }
    }
    out.push(c);
  });
  const kept = new Set(after.map((r) => r.id));
  before.forEach((r, i) => { if (!kept.has(r.id)) out.push({ id: r.id, position: i + 1, kind: "removed" }); });
  return out;
}

/** "Changed rule 2 · 50.00 → 51.00", "Added rule 3", "Removed rule 1". */
export function describeChanges(changes: RuleChange[]): string | null {
  const c = changes[0];
  if (!c) return null;
  if (c.kind === "added") return `Added rule ${c.position}`;
  if (c.kind === "removed") return `Removed rule ${c.position}`;
  if (c.fromValue && c.toValue) return `Changed rule ${c.position} · ${c.fromValue} → ${c.toValue}`;
  return `Changed rule ${c.position}`;
}
