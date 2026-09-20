"use client";

/**
 * The rule editor: pickers for what to check, the level, what to do and how long to wait, with the live value beside
 * the level and a plain evaluation line at the bottom. Editing a value Koul filled in clears its "inferred" mark.
 */
import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveDot, Term } from "@/components/koul/primitives";
import {
  ACTION_LABELS, CONDITION_LABELS, COOLDOWN_OPTIONS, conditionSentence, evaluateAutopilot, makeRule,
  type ActionKind, type Comparator, type Condition, type ConditionKind, type LiveValues, type Rule,
} from "@/lib/model/autopilot";
import { Segmented } from "./segmented";
import { NowPill } from "./rule-card";

const KIND_ITEMS: { value: ConditionKind; label: string }[] = [
  { value: "fx_price", label: "USD/TRY" },
  { value: "health_factor", label: "My loan health" },
  { value: "rate_gap", label: "The better pool pays more by" },
  { value: "idle_usdc", label: "Idle USDC in my wallet" },
];
const ACTION_ITEMS: { value: ActionKind; label: string }[] = [
  { value: "withdraw_to_wallet", label: "Withdraw from the pools to my wallet" },
  { value: "move_to_best_pool", label: "Move my USDC to the pool that pays more" },
  { value: "repay_from_wallet", label: "Repay my loan from the USDC in my wallet" },
];
const comparatorItems = (kind: ConditionKind): { value: Comparator; label: string }[] =>
  kind === "rate_gap"
    ? [{ value: "gte", label: "at least" }, { value: "lte", label: "at most" }]
    : [{ value: "gte", label: "is at or above" }, { value: "lte", label: "is at or below" }];
const COOLDOWN_ITEMS = COOLDOWN_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
const DEFAULT_VALUE: Record<ConditionKind, number> = { fx_price: 50, health_factor: 1.25, rate_gap: 1, idle_usdc: 10 };
const DEFAULT_COMPARATOR: Record<ConditionKind, Comparator> = { fx_price: "gte", health_factor: "lte", rate_gap: "gte", idle_usdc: "gte" };
const UNIT: Record<ConditionKind, string> = { fx_price: "TRY per USD", health_factor: "", rate_gap: "pts", idle_usdc: "USDC" };
const MAX_CONDITIONS = 3;

const parseNum = (s: string): number | null => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

function freshRule(): Rule {
  return makeRule({ name: "New rule", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 86400 });
}

export interface RuleEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = a new rule. Mount with a fresh `key` each time the editor opens so the form starts from `rule`. */
  rule: Rule | null;
  live: LiveValues;
  onSave: (rule: Rule) => void;
  onDelete?: (ruleId: string) => void;
}

export function RuleEditorSheet({ open, onOpenChange, rule, live, onSave, onDelete }: RuleEditorSheetProps) {
  const isNew = rule === null;
  const [draft, setDraft] = React.useState<Rule>(() => (rule ? { ...rule, conditions: rule.conditions.map((c) => ({ ...c })), action: { ...rule.action }, inferred: [...rule.inferred] } : freshRule()));
  const [texts, setTexts] = React.useState<string[]>(() => draft.conditions.map((c) => String(c.value)));
  const [amountText, setAmountText] = React.useState(() => (typeof draft.action.amount === "number" ? String(draft.action.amount) : "50"));
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const patch = (fn: (r: Rule) => Rule) => setDraft((r) => fn(r));
  const dropInferred = (r: Rule, path: string): Rule => ({ ...r, inferred: r.inferred.filter((p) => p !== path) });
  const setCondition = (i: number, fn: (c: Condition) => Condition) => patch((r) => ({ ...r, conditions: r.conditions.map((c, j) => (j === i ? fn(c) : c)) }));

  const setKind = (i: number, kind: ConditionKind) => {
    setCondition(i, () => ({ kind, comparator: DEFAULT_COMPARATOR[kind], value: DEFAULT_VALUE[kind] }));
    setTexts((t) => t.map((s, j) => (j === i ? String(DEFAULT_VALUE[kind]) : s)));
    patch((r) => dropInferred(r, `conditions.${i}.value`));
  };
  const setComparator = (i: number, comparator: Comparator) => setCondition(i, (c) => ({ ...c, comparator }));
  const setValueText = (i: number, s: string) => {
    setTexts((t) => t.map((v, j) => (j === i ? s : v)));
    const n = parseNum(s);
    if (n !== null) setCondition(i, (c) => ({ ...c, value: n }));
    patch((r) => dropInferred(r, `conditions.${i}.value`));
  };
  const addCondition = () => {
    const used = new Set(draft.conditions.map((c) => c.kind));
    const kind = KIND_ITEMS.find((k) => !used.has(k.value))?.value ?? "idle_usdc";
    patch((r) => ({ ...r, conditions: [...r.conditions, { kind, comparator: DEFAULT_COMPARATOR[kind], value: DEFAULT_VALUE[kind] }] }));
    setTexts((t) => [...t, String(DEFAULT_VALUE[kind])]);
  };
  const removeCondition = (i: number) => {
    patch((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i), inferred: r.inferred.filter((p) => !p.startsWith(`conditions.${i}.`)) }));
    setTexts((t) => t.filter((_, j) => j !== i));
  };
  const setAmountMode = (mode: "all" | "amount") => patch((r) => ({ ...r, action: { ...r.action, amount: mode === "all" ? "all" : parseNum(amountText) ?? 50 } }));
  const setAmount = (s: string) => {
    setAmountText(s);
    const n = parseNum(s);
    if (n !== null) patch((r) => ({ ...r, action: { ...r.action, amount: n } }));
  };
  const setCooldown = (sec: number) => patch((r) => dropInferred({ ...r, cooldownSec: sec }, "cooldownSec"));

  const values = draft.conditions.map((_, i) => parseNum(texts[i] ?? ""));
  const valuesOk = values.every((v) => v !== null && v >= 0);
  const amountOk = draft.action.amount === "all" || (typeof draft.action.amount === "number" && draft.action.amount > 0);
  const canSave = draft.name.trim().length > 0 && draft.conditions.length > 0 && valuesOk && amountOk;

  const ev = React.useMemo(() => evaluateAutopilot({ rules: [draft] }, live).rules[0], [draft, live]);
  const evalLine = describeEval(draft, ev);

  const save = () => {
    if (!canSave) return;
    onSave({ ...draft, name: draft.name.trim() });
    onOpenChange(false);
  };

  const footer = confirmDelete ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm">Delete this rule?</span>
      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="min-h-11" onClick={() => setConfirmDelete(false)}>Keep it</Button>
        <Button variant="destructive" size="lg" className="min-h-11" onClick={() => { onDelete?.(draft.id); onOpenChange(false); }}><Trash2 data-icon="inline-start" /> Delete</Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      {!isNew && onDelete ? (
        <Button variant="ghost" size="lg" className="min-h-11 text-muted-foreground hover:text-negative" onClick={() => setConfirmDelete(true)}><Trash2 data-icon="inline-start" /> Delete</Button>
      ) : <span />}
      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button size="lg" className="min-h-11 px-4 text-[15px]" disabled={!canSave} onClick={save}>{isNew ? "Add rule" : "Save rule"}</Button>
      </div>
    </div>
  );

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={isNew ? "New rule" : `Edit rule`} description="A rule is one sentence: when something is true, do one thing, then wait." footer={footer} width="md:max-w-[560px]">
      <div className="grid gap-6 pt-1">
        <div className="grid gap-1.5">
          <Label htmlFor="rule-name" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Name</Label>
          <Input id="rule-name" value={draft.name} onChange={(e) => patch((r) => ({ ...r, name: e.target.value }))} className="h-11 text-base" maxLength={40} placeholder="Lira exit" />
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">When</legend>
          {draft.conditions.map((c, i) => {
            const cev = ev.conditions[i];
            const s = conditionSentence(c);
            return (
              <React.Fragment key={i}>
                {i > 0 && (
                  <Segmented
                    size="sm"
                    label="How the conditions combine"
                    value={draft.match}
                    onChange={(m) => patch((r) => ({ ...r, match: m }))}
                    options={[{ value: "all", label: "and (all must be true)" }, { value: "any", label: "or (any one is enough)" }]}
                    className="w-full"
                  />
                )}
                <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                  <div className="flex items-center gap-2">
                    <Select value={c.kind} onValueChange={(v) => v && setKind(i, v as ConditionKind)} items={KIND_ITEMS}>
                      <SelectTrigger className="h-11 min-w-0 flex-1 data-[size=default]:h-11" aria-label={`Condition ${i + 1}: what to check`}><SelectValue /></SelectTrigger>
                      <SelectContent>{KIND_ITEMS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {draft.conditions.length > 1 && (
                      <Button variant="ghost" size="icon-lg" className="size-11 shrink-0 text-muted-foreground" aria-label={`Remove condition ${i + 1}`} onClick={() => removeCondition(i)}><X className="size-4" /></Button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
                    <Select value={c.comparator} onValueChange={(v) => v && setComparator(i, v as Comparator)} items={comparatorItems(c.kind)}>
                      <SelectTrigger className="h-11 w-full data-[size=default]:h-11" aria-label={`Condition ${i + 1}: comparison`}><SelectValue /></SelectTrigger>
                      <SelectContent>{comparatorItems(c.kind).map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="relative">
                      <Input
                        inputMode="decimal"
                        value={texts[i] ?? ""}
                        onChange={(e) => setValueText(i, e.target.value)}
                        aria-label={`Condition ${i + 1}: level${UNIT[c.kind] ? ` in ${UNIT[c.kind]}` : ""}`}
                        aria-invalid={values[i] === null || (values[i] ?? 0) < 0}
                        className={cn("num h-11 pr-12 text-base", UNIT[c.kind] === "" && "pr-3")}
                      />
                      {UNIT[c.kind] && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium tracking-wide text-muted-foreground">{UNIT[c.kind] === "TRY per USD" ? "₺/$" : UNIT[c.kind]}</span>}
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {cev ? <NowPill ev={cev} /> : null}
                    <Term detail={CONDITION_LABELS[c.kind].technical}>{s.subject}</Term>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          {draft.conditions.length < MAX_CONDITIONS && (
            <Button variant="outline" size="lg" className="min-h-11 justify-start border-dashed text-muted-foreground" onClick={addCondition}><Plus data-icon="inline-start" /> Add an “and” / “or” condition</Button>
          )}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">Do</legend>
          <Select value={draft.action.kind} onValueChange={(v) => v && patch((r) => ({ ...r, action: { ...r.action, kind: v as ActionKind } }))} items={ACTION_ITEMS}>
            <SelectTrigger className="h-11 w-full data-[size=default]:h-11" aria-label="What to do"><SelectValue /></SelectTrigger>
            <SelectContent>{ACTION_ITEMS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
            <Segmented
              label="How much"
              value={draft.action.amount === "all" ? "all" : "amount"}
              onChange={setAmountMode}
              options={[{ value: "all", label: "Everything" }, { value: "amount", label: "An amount" }]}
            />
            <div className="relative">
              <Input inputMode="decimal" value={amountText} onChange={(e) => setAmount(e.target.value)} disabled={draft.action.amount === "all"} aria-label="Amount in USDC" className="num h-11 pr-12 text-base" />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] font-medium tracking-wide text-muted-foreground">USDC</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <Term detail={ACTION_LABELS[draft.action.kind].technical}>Technical</Term>
            {draft.action.amount !== "all" && <span className="text-warning"> · Only “everything” can run on-chain today; an amount is saved locally.</span>}
          </p>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">Then</legend>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">wait</span>
            <Select value={String(draft.cooldownSec)} onValueChange={(v) => v && setCooldown(Number(v))} items={COOLDOWN_ITEMS}>
              <SelectTrigger className="num h-11 w-28 data-[size=default]:h-11" aria-label="Cooldown"><SelectValue /></SelectTrigger>
              <SelectContent>{COOLDOWN_ITEMS.map((o) => <SelectItem key={o.value} value={o.value}><span className="num">{o.label}</span></SelectItem>)}</SelectContent>
            </Select>
            <span className="text-muted-foreground">before this rule can run again</span>
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <Label htmlFor="rule-enabled" className="text-sm font-normal">This rule is on</Label>
          <Switch id="rule-enabled" checked={draft.enabled} onCheckedChange={(v) => patch((r) => ({ ...r, enabled: v }))} />
        </div>

        <div className={cn("flex items-start gap-3 rounded-lg p-3 text-sm", evalLine.tone === "saffron" ? "bg-saffron-soft" : "bg-surface-2")} role="status" aria-live="polite">
          <LiveDot tone={evalLine.tone === "saffron" ? "saffron" : evalLine.tone === "warning" ? "warning" : "muted"} className="mt-1.5" />
          <span className={cn("leading-relaxed", evalLine.tone === "saffron" && "text-saffron")}>{evalLine.text}</span>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

function describeEval(rule: Rule, ev: ReturnType<typeof evaluateAutopilot>["rules"][number]): { text: string; tone: "saffron" | "neutral" | "warning" } {
  if (!rule.enabled) return { text: "Switched off. Koul skips this rule until you turn it on.", tone: "neutral" };
  const parts = rule.conditions.map((c, i) => {
    const s = conditionSentence(c);
    const cev = ev.conditions[i];
    const now = !cev || cev.now === null ? cev?.nowLabel ?? "—" : cev.nowLabel;
    return `${s.subject} is ${now}, the level is ${s.value}`;
  });
  const unreadable = ev.conditions.some((c) => c.met === null && c.nowLabel !== "no loan");
  if (ev.wouldRun) return { text: `True now: Koul would ${ev.wouldDo}.`, tone: "saffron" };
  if (ev.conditionsMet) return { text: `True, nothing to do: ${ev.blocker ?? "nothing to act on"}.`, tone: "neutral" };
  if (unreadable) return { text: `No reading right now: ${parts.join("; ")}.`, tone: "warning" };
  return { text: `Not true now: ${parts.join("; ")}.`, tone: "neutral" };
}
