"use client";

/**
 * The editing list: one tile per rule with a drag handle, the rule as a line, its live value, ON or OFF and a
 * chevron. The open rule shows its IF, THEN and WAIT BETWEEN RUNS groups, a RULE ON switch and Delete. Rows
 * reorder by drag on desktop and by the arrows next to the handle everywhere.
 */
import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label, PillButton, Tile } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import { POOLS, type Action, type Comparator, type Condition, type ConditionKind, type LiveValues, type Rule } from "@/lib/model/autopilot";
import { ACTION_CHOICES, CONDITION_SUBJECTS, agoShort, cooldownShort, liveLabel, observedLabel } from "@/lib/model/labels";
import type { LiveRule } from "@/hooks/use-autopilot-live";
import type { Editor } from "./use-editor";
import { cn } from "@/lib/utils";

const pill = "h-11 rounded-full border-0 bg-surface-2 px-4 mono text-text data-[size=default]:h-11 hover:brightness-110 [&_svg]:text-muted";
const popup = "rounded-[var(--radius-group)] border border-line bg-surface p-1 shadow-none ring-0";
const item = "mono rounded-lg py-2.5 pl-3 pr-9 text-text focus:bg-surface-2";

function defaultsFor(kind: ConditionKind): Condition {
  switch (kind) {
    case "fx_price": return { kind, comparator: "gte", value: 50 };
    case "health_factor": return { kind, comparator: "lte", value: 1.25 };
    case "rate_gap": return { kind, comparator: "gte", value: 1 };
    case "idle_usdc": return { kind, comparator: "gte", value: 100 };
    case "pool_rate": return { kind, comparator: "lte", value: 2, pool: "B" };
  }
}

/** Which actions and conditions the router can pair. Moves need the rate gap; the rate gap only moves. */
export function pairingProblem(rule: Rule): string | null {
  const hasGap = rule.conditions.some((c) => c.kind === "rate_gap");
  if (rule.action.kind === "move_to_best_pool" && !hasGap) return "Moving to the better hub needs the rate gap as its condition";
  if (rule.action.kind !== "move_to_best_pool" && hasGap) return "The rate gap can only move USDC to the better hub";
  if (rule.conditions.some((c) => c.kind === "rate_gap" && c.comparator !== "gte")) return "The rate gap only works as \"more than\"";
  if (rule.conditions.some((c) => !(c.value > 0))) return "Every level must be above zero";
  return null;
}

export function ruleTemplate(): Rule {
  return { id: `r_${Date.now().toString(36)}`, name: "Rule", conditions: [defaultsFor("fx_price")], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600, inferred: [], enabled: true };
}

function ConditionPickers({ c, i, onChange }: { c: Condition; i: number; onChange: (next: Condition) => void }) {
  const isGap = c.kind === "rate_gap";
  const unit = CONDITION_SUBJECTS.find((s) => s.kind === c.kind)?.unit ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={c.kind} onValueChange={(v) => v && onChange(defaultsFor(v as ConditionKind))} items={CONDITION_SUBJECTS.map((s) => ({ value: s.kind, label: s.label }))}>
        <SelectTrigger className={pill} aria-label={`Condition ${i + 1}: what to check`}><SelectValue /></SelectTrigger>
        <SelectContent className={popup}>{CONDITION_SUBJECTS.map((s) => <SelectItem key={s.kind} value={s.kind} className={item}>{s.label}</SelectItem>)}</SelectContent>
      </Select>
      {c.kind === "pool_rate" && (
        <Select value={c.pool ?? "B"} onValueChange={(v) => v && onChange({ ...c, pool: v as "A" | "B" })} items={[{ value: "A", label: `hub ${POOLS.A.hub}` }, { value: "B", label: `hub ${POOLS.B.hub}` }]}>
          <SelectTrigger className={pill} aria-label="Which hub"><SelectValue /></SelectTrigger>
          <SelectContent className={popup}>{(["A", "B"] as const).map((p) => <SelectItem key={p} value={p} className={item}>{`hub ${POOLS[p].hub}`}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Select value={c.comparator} onValueChange={(v) => v && onChange({ ...c, comparator: v as Comparator })} items={[{ value: "gte", label: ">" }, { value: "lte", label: "<" }]} disabled={isGap}>
        <SelectTrigger className={cn(pill, "min-w-[68px]")} aria-label="Comparison"><SelectValue /></SelectTrigger>
        <SelectContent className={popup}><SelectItem value="gte" className={item}>&gt;</SelectItem><SelectItem value="lte" className={item}>&lt;</SelectItem></SelectContent>
      </Select>
      <label className="relative inline-flex h-11 items-center rounded-full border border-line px-4">
        <span className="sr-only">Level</span>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={Number.isFinite(c.value) ? c.value : ""}
          onChange={(e) => onChange({ ...c, value: e.target.value === "" ? NaN : Number(e.target.value) })}
          className="mono w-24 bg-transparent text-text outline-none"
        />
        {unit && <span className="mono ml-1 text-muted">{unit}</span>}
      </label>
    </div>
  );
}

function ActionPickers({ action, onChange }: { action: Action; onChange: (next: Action) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={action.kind} onValueChange={(v) => v && onChange({ kind: v as Action["kind"], amount: "all", ...(v === "supply_from_wallet" ? { pool: "B" as const } : {}) })} items={ACTION_CHOICES.map((a) => ({ value: a.kind, label: a.label }))}>
        <SelectTrigger className={pill} aria-label="What to do"><SelectValue /></SelectTrigger>
        <SelectContent className={popup}>{ACTION_CHOICES.map((a) => <SelectItem key={a.kind} value={a.kind} className={item}>{a.label}</SelectItem>)}</SelectContent>
      </Select>
      {action.kind === "supply_from_wallet" && (
        <Select value={action.pool ?? "B"} onValueChange={(v) => v && onChange({ ...action, pool: v as "A" | "B" })} items={[{ value: "A", label: `Hub ${POOLS.A.hub}` }, { value: "B", label: `Hub ${POOLS.B.hub}` }]}>
          <SelectTrigger className={pill} aria-label="Which hub"><SelectValue /></SelectTrigger>
          <SelectContent className={popup}>{(["A", "B"] as const).map((p) => <SelectItem key={p} value={p} className={item}>{`Hub ${POOLS[p].hub}`}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

/** The waits a person picks from; a rule read back from the chain keeps whatever it has, listed alongside. */
const WAITS: { value: number; label: string }[] = [60, 300, 600, 1800, 3600, 21600, 43200, 86400].map((value) => ({ value, label: cooldownShort(value) }));
const waitsFor = (current: number) => (WAITS.some((o) => o.value === current) ? WAITS : [...WAITS, { value: current, label: cooldownShort(current) }].sort((a, b) => a.value - b.value));

export function RuleEditor({ editor, liveRules, live, now, onAdd }: { editor: Editor; liveRules: LiveRule[]; live: LiveValues; now: number; onAdd: () => void }) {
  const [dragging, setDragging] = React.useState<number | null>(null);
  const byId = new Map(liveRules.map((r) => [r.rule.id, r] as const));
  return (
    <div className="grid gap-3">
      {editor.rules.map((rule, i) => {
        const open = editor.open === rule.id;
        const lr = byId.get(rule.id);
        const first = rule.conditions[0]!;
        const problem = pairingProblem(rule);
        // A rule copied from the chain keeps its live reading; a new or changed one reads the app's live values.
        const nowText = lr && lr.observed !== null ? observedLabel(first.kind, lr.observed) : liveLabel(first, live);
        return (
          <Tile
            key={rule.id}
            tone={open ? "outlined" : "surface"}
            padded={false}
            className={cn("px-4 md:px-6", dragging === i && "opacity-60")}
            draggable
            onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => { e.preventDefault(); if (dragging !== null) editor.moveTo(dragging, i); setDragging(null); }}
            onDragEnd={() => setDragging(null)}
          >
            <div className="flex items-start gap-2 md:items-center">
              <div className="flex flex-col items-center pt-4 md:flex-row md:pt-0">
                <span className="hidden cursor-grab text-dim md:inline" aria-hidden><GripVertical className="size-4" /></span>
                <span className="flex flex-col">
                  <button type="button" aria-label={`Move rule ${i + 1} up`} disabled={i === 0} onClick={() => editor.move(rule.id, -1)} className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-text disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-lime"><ChevronUp className="size-4" /></button>
                  <button type="button" aria-label={`Move rule ${i + 1} down`} disabled={i === editor.rules.length - 1} onClick={() => editor.move(rule.id, 1)} className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:text-text disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-lime"><ChevronDown className="size-4" /></button>
                </span>
              </div>
              <button type="button" onClick={() => editor.setOpen(open ? null : rule.id)} aria-expanded={open} className="min-w-0 flex-1 rounded-lg text-left transition-opacity hover:opacity-90 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime">
                <RuleLine
                  index={i + 1}
                  rule={rule}
                  current={lr?.current}
                  ranAgo={lr?.current && lr.lastRunAt ? agoShort(lr.lastRunAt, now) : null}
                  now={nowText}
                  dimmed={!rule.enabled}
                  trailing={<span className={cn(rule.enabled ? "text-lime" : "text-dim")}>{rule.enabled ? "ON" : "OFF"}</span>}
                  className="py-4 md:py-5"
                />
              </button>
              <ChevronDown className={cn("mt-5 size-4 shrink-0 text-muted transition-transform md:mt-0", open && "rotate-180")} aria-hidden />
            </div>
            {open && (
              <div className="grid gap-5 border-t border-line py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto] md:items-start md:gap-8">
                <div className="grid gap-2">
                  <Label>If</Label>
                  <div className="grid gap-2">
                    {rule.conditions.map((c, ci) => (
                      <div key={ci} className="flex flex-wrap items-center gap-2">
                        {ci > 0 && <Label className="w-10">{rule.match === "all" ? "and" : "or"}</Label>}
                        <ConditionPickers c={c} i={ci} onChange={(next) => editor.update(rule.id, (r) => ({ ...r, conditions: r.conditions.map((x, k) => (k === ci ? next : x)) }))} />
                        {rule.conditions.length > 1 && <button type="button" onClick={() => editor.update(rule.id, (r) => ({ ...r, conditions: r.conditions.filter((_, k) => k !== ci) }))} className="label min-h-11 rounded-full px-3 text-muted hover:text-text">Remove</button>}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <Label>Then</Label>
                    <ActionPickers action={rule.action} onChange={(next) => editor.update(rule.id, { action: next })} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Wait between runs</Label>
                    <Select value={String(rule.cooldownSec)} onValueChange={(v) => v && editor.update(rule.id, { cooldownSec: Number(v) })} items={waitsFor(rule.cooldownSec).map((o) => ({ value: String(o.value), label: o.label }))}>
                      <SelectTrigger className={cn(pill, "w-fit")} aria-label="Wait between runs"><SelectValue /></SelectTrigger>
                      <SelectContent className={popup}>{waitsFor(rule.cooldownSec).map((o) => <SelectItem key={o.value} value={String(o.value)} className={item}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 md:flex-col md:items-end">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <Label>Rule on</Label>
                    <Switch checked={rule.enabled} onCheckedChange={() => editor.toggle(rule.id)} aria-label={`Rule ${i + 1} on`} />
                  </label>
                  <PillButton variant="outline" size="md" onClick={() => editor.remove(rule.id)}>Delete</PillButton>
                </div>
                {problem && <Label tone="danger" className="md:col-span-3">{problem}</Label>}
              </div>
            )}
          </Tile>
        );
      })}
      <button type="button" onClick={onAdd} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed border-line text-[16px] font-bold text-text transition-colors hover:border-muted active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime">
        <Plus className="size-5" aria-hidden /> Add rule
      </button>
    </div>
  );
}
