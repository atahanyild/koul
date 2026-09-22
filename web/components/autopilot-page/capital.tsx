"use client";

/**
 * The capital pill on the editing page: how much of what it could move every rule takes. Everything, or a share.
 * One change for the whole list, undoable; a rule with a fixed USDC amount keeps it. "Mixed" means the rules
 * disagree, which is fine, and picking a share lines them up again.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/signal";
import { applyCapital, CAPITAL_CHOICES, capitalOf } from "@/lib/model/capital";
import type { Rule } from "@/lib/model/autopilot";

const pill = "h-11 rounded-full border-0 bg-surface-2 px-4 mono text-text data-[size=default]:h-11 hover:brightness-110 [&_svg]:text-muted";
const popup = "rounded-[var(--radius-group)] border border-line bg-surface p-1 shadow-none ring-0";
const item = "mono rounded-lg py-2.5 pl-3 pr-9 text-text focus:bg-surface-2";

const label = (p: number) => (p >= 100 ? "Everything" : `${p}%`);

export function Capital({ rules, onChange }: { rules: Rule[]; onChange: (rules: Rule[]) => void }) {
  const current = capitalOf(rules);
  if (current === null) return null;
  const value = current === "mixed" ? "mixed" : String(current);
  const items = [...CAPITAL_CHOICES.map((p) => ({ value: String(p), label: label(p) })), ...(current === "mixed" ? [{ value: "mixed", label: "Mixed" }] : [])];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Label>Capital</Label>
      <Select value={value} onValueChange={(v) => { if (v && v !== "mixed") onChange(applyCapital(rules, Number(v))); }} items={items}>
        <SelectTrigger className={pill} aria-label="Capital: how much of what it could move each rule takes"><SelectValue /></SelectTrigger>
        <SelectContent className={popup}>{items.map((o) => <SelectItem key={o.value} value={o.value} className={item} disabled={o.value === "mixed"}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      <Label className="hidden md:inline">of what each rule could move · fixed amounts stay</Label>
    </div>
  );
}
