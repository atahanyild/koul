"use client";

/**
 * The editing list: one tile per rule with a drag handle, the rule as a line, its live value, ON or OFF and a
 * chevron. The open rule shows its IF, THEN and WAIT BETWEEN RUNS groups, a RULE ON switch, Move up, Move down
 * and Delete. Rows reorder by the handle: a 6 px pointer drag, a 150 ms press on touch, or space, arrows and space
 * on the keyboard, with the numbers following the order live. A drop is one change, and Undo takes it back.
 */
import * as React from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { DUR, SPRING_SOFT, tween } from "@/lib/motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label, PillButton, Tile } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import { POOLS, type Action, type Comparator, type Condition, type ConditionKind, type LiveValues, type Rule } from "@/lib/model/autopilot";
import { ACTION_CHOICES, CONDITION_SUBJECTS, agoShort, cooldownShort, liveLabel, observedLabel } from "@/lib/model/labels";
import type { LiveRule } from "@/hooks/use-autopilot-live";
import type { Editor } from "./use-editor";
import { MIN_AMOUNT_USDC, pairingProblem } from "@/lib/model/pairing";
import { parseAmount, sanitizeAmount } from "@/components/flows/amount-input";
import type { RuleChange } from "@/lib/chat/diff";
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

export { pairingProblem };

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

/** What "everything" means for each action, and the number it is measured against, for the hint under the amount. */
function amountContext(kind: Action["kind"], live: LiveValues): { all: string; have: number | null } {
  const supplied = live.suppliedA !== null && live.suppliedB !== null ? live.suppliedA + live.suppliedB : null;
  switch (kind) {
    case "supply_from_wallet": return { all: "every idle USDC in the wallet", have: live.idleUsdc };
    case "repay_from_wallet": return { all: "the whole debt, from the wallet", have: live.idleUsdc };
    case "withdraw_to_wallet": return { all: "everything supplied", have: supplied };
    case "move_to_best_pool": return { all: "everything supplied", have: supplied };
  }
}

const AMOUNT_MODES = [{ value: "all", label: "Everything" }, { value: "fixed", label: "An amount" }];

function ActionPickers({ action, live, onChange }: { action: Action; live: LiveValues; onChange: (next: Action) => void }) {
  const fixed = action.amount !== "all";
  const [text, setText] = React.useState(fixed ? String(action.amount) : "");
  // The field follows the rule when something else changes the amount (a chat edit, Undo), not while it is typed in.
  const [seen, setSeen] = React.useState(action.amount);
  if (action.amount !== seen) {
    setSeen(action.amount);
    if (action.amount !== "all" && parseAmount(text) !== action.amount) setText(String(action.amount));
  }
  const ctx = amountContext(action.kind, live);
  const have = ctx.have === null ? null : ctx.have.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <Select value={action.kind} onValueChange={(v) => v && onChange({ kind: v as Action["kind"], amount: action.amount, ...(v === "supply_from_wallet" ? { pool: "B" as const } : {}) })} items={ACTION_CHOICES.map((a) => ({ value: a.kind, label: a.label }))}>
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
    <div className="flex flex-wrap items-center gap-2">
      <Select value={fixed ? "fixed" : "all"} onValueChange={(v) => v && onChange({ ...action, amount: v === "all" ? "all" : Math.max(MIN_AMOUNT_USDC, parseAmount(text) || (ctx.have && ctx.have >= MIN_AMOUNT_USDC ? Math.floor(ctx.have) : 10)) })} items={AMOUNT_MODES}>
        <SelectTrigger className={pill} aria-label="How much"><SelectValue /></SelectTrigger>
        <SelectContent className={popup}>{AMOUNT_MODES.map((m) => <SelectItem key={m.value} value={m.value} className={item}>{m.label}</SelectItem>)}</SelectContent>
      </Select>
      {fixed && (
        <label className="mono flex h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-text">
          <input
            value={text}
            onChange={(e) => { const s = sanitizeAmount(e.target.value); setText(s); const n = parseAmount(s); if (n > 0) onChange({ ...action, amount: n }); }}
            onBlur={() => { const n = parseAmount(text); if (!(n >= MIN_AMOUNT_USDC)) { setText(String(MIN_AMOUNT_USDC)); onChange({ ...action, amount: MIN_AMOUNT_USDC }); } }}
            inputMode="decimal"
            autoComplete="off"
            size={6}
            aria-label="Amount in USDC"
            className="num w-[7ch] bg-transparent text-right outline-none placeholder:text-dim"
            placeholder="0"
          />
          <span className="text-muted">USDC</span>
        </label>
      )}
      {have !== null && (
        <button type="button" onClick={() => { if (ctx.have !== null && ctx.have >= MIN_AMOUNT_USDC) { const n = Math.floor(ctx.have * 100) / 100; setText(String(n)); onChange({ ...action, amount: n }); } }} className="label min-h-11 rounded-full px-3 text-muted hover:text-text" disabled={ctx.have === null || ctx.have < MIN_AMOUNT_USDC}>
          {fixed ? `You have ${have} USDC` : `Everything = ${ctx.all} · ${have} USDC now`}
        </button>
      )}
    </div>
    </div>
  );
}

/** The waits a person picks from; a rule read back from the chain keeps whatever it has, listed alongside. */
const WAITS: { value: number; label: string }[] = [60, 300, 600, 1800, 3600, 21600, 43200, 86400].map((value) => ({ value, label: cooldownShort(value) }));
const waitsFor = (current: number) => (WAITS.some((o) => o.value === current) ? WAITS : [...WAITS, { value: current, label: cooldownShort(current) }].sort((a, b) => a.value - b.value));

/** The drag handle: the only thing that starts a sort, on every pointer type. */
function Handle({ index, attributes, listeners, setActivatorNodeRef }: { index: number; attributes: React.HTMLAttributes<HTMLButtonElement>; listeners: Record<string, unknown> | undefined; setActivatorNodeRef: (el: HTMLElement | null) => void }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      data-drag-handle
      aria-label={`Drag to reorder rule ${index + 1}`}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

function SortableRule({ rule, i, shownIndex, editor, lr, live, now, dragging, highlighted, change, onUndo }: { rule: Rule; i: number; shownIndex: number; editor: Editor; lr: LiveRule | undefined; live: LiveValues; now: number; dragging: boolean; highlighted: boolean; change?: RuleChange; onUndo?: () => void }) {
  // dnd-kit moves the row while it is held; the wrapper's layout animation moves it once the order has changed.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id, animateLayoutChanges: () => false, transition: { duration: 250, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } });
  const open = editor.open === rule.id;
  const first = rule.conditions[0]!;
  const problem = pairingProblem(rule);
  // A rule copied from the chain keeps its live reading; a new or changed one reads the app's live values.
  const nowText = lr && lr.observed !== null ? observedLabel(first.kind, lr.observed) : liveLabel(first, live);
  const count = editor.rules.length;
  return (
    <motion.div layout={!dragging} layoutId={`rule-${rule.id}`} transition={SPRING_SOFT} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} className="min-w-0">
    <Tile
      ref={setNodeRef}
      tone={open || highlighted || !!change ? "outlined" : "surface"}
      padded={false}
      data-dragging={isDragging || undefined}
      className={cn("px-4 md:px-6", isDragging && "relative z-10 scale-[1.02] border border-accent-text shadow-[0_12px_40px_rgba(0,0,0,0.35)]", dragging && !isDragging && "transition-transform")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex items-start gap-2 md:items-center">
        <div className="flex items-center pt-2 md:pt-0">
          <Handle index={i} attributes={attributes as React.HTMLAttributes<HTMLButtonElement>} listeners={listeners as Record<string, unknown> | undefined} setActivatorNodeRef={setActivatorNodeRef} />
        </div>
        <button type="button" onClick={() => editor.setOpen(open ? null : rule.id)} aria-expanded={open} className="min-w-0 flex-1 rounded-lg text-left transition-opacity hover:opacity-90 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text">
          <RuleLine
            index={shownIndex + 1}
            rule={rule}
            current={lr?.current}
            ranAgo={lr?.current && lr.lastRunAt ? agoShort(lr.lastRunAt, now) : null}
            now={nowText}
            nowOverride={change ? <span className="text-accent-text">CHANGED · <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onUndo?.(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onUndo?.(); } }} className="cursor-pointer underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent-text rounded">UNDO</span></span> : undefined}
            strike={change?.fromValue && change.toValue ? { from: change.fromValue, to: change.toValue } : null}
            dimmed={!rule.enabled}
            trailing={<span className={cn(rule.enabled ? "text-accent-text" : "text-muted")}>{rule.enabled ? "ON" : "OFF"}</span>}
            className="py-4 md:py-5"
          />
        </button>
        <motion.span className="mt-5 inline-flex shrink-0 md:mt-0" animate={{ rotate: open ? 180 : 0 }} transition={tween(DUR.base)} aria-hidden><ChevronDown className="size-4 text-muted" /></motion.span>
      </div>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div key="panel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tween(DUR.base)} className="overflow-hidden">
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
              <ActionPickers action={rule.action} live={live} onChange={(next) => editor.update(rule.id, { action: next })} />
            </div>
            <div className="grid gap-2">
              <Label>Wait between runs</Label>
              <Select value={String(rule.cooldownSec)} onValueChange={(v) => v && editor.update(rule.id, { cooldownSec: Number(v) })} items={waitsFor(rule.cooldownSec).map((o) => ({ value: String(o.value), label: o.label }))}>
                <SelectTrigger className={cn(pill, "w-fit")} aria-label="Wait between runs"><SelectValue /></SelectTrigger>
                <SelectContent className={popup}>{waitsFor(rule.cooldownSec).map((o) => <SelectItem key={o.value} value={String(o.value)} className={item}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 md:flex-col md:items-end">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Label>Rule on</Label>
              <Switch checked={rule.enabled} onCheckedChange={() => editor.toggle(rule.id)} aria-label={`Rule ${i + 1} on`} />
            </label>
            <div className="flex gap-2">
              <PillButton variant="outline" size="md" onClick={() => editor.move(rule.id, -1)} disabled={i === 0} aria-label={`Move rule ${i + 1} up`}><ChevronUp className="size-4" aria-hidden /> Move up</PillButton>
              <PillButton variant="outline" size="md" onClick={() => editor.move(rule.id, 1)} disabled={i === count - 1} aria-label={`Move rule ${i + 1} down`}><ChevronDown className="size-4" aria-hidden /> Move down</PillButton>
            </div>
            <PillButton variant="outline" size="md" onClick={() => editor.remove(rule.id)}>Delete</PillButton>
          </div>
          {problem && <Label tone="danger" className="md:col-span-3">{problem}</Label>}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </Tile>
    </motion.div>
  );
}

export function RuleEditor({ editor, liveRules, live, now, highlight, changes, onUndo, onAdd }: { editor: Editor; liveRules: LiveRule[]; live: LiveValues; now: number; highlight?: string | null; /** What the chat changed, for the CHANGED · UNDO marks. */ changes?: RuleChange[]; onUndo?: () => void; onAdd: () => void }) {
  const byId = new Map(liveRules.map((r) => [r.rule.id, r] as const));
  const ids = editor.rules.map((r) => r.id);
  // While a row is held, `order` is where the rows would land, so the numbers follow the drag.
  const [order, setOrder] = React.useState<string[] | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragStart = (e: DragStartEvent) => { editor.setOpen(null); setOrder(ids.slice()); void e; };
  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) return;
    setOrder((o) => { const list = o ?? ids; const from = list.indexOf(String(e.active.id)); const to = list.indexOf(String(e.over!.id)); return from < 0 || to < 0 || from === to ? list : arrayMove(list, from, to); });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setOrder(null);
    if (!e.over) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from >= 0 && to >= 0 && from !== to) editor.moveTo(from, to);
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up rule ${ids.indexOf(String(active.id)) + 1} of ${ids.length}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => (over ? `Rule ${ids.indexOf(String(active.id)) + 1} is over position ${(order ?? ids).indexOf(String(over.id)) + 1}.` : `Rule ${ids.indexOf(String(active.id)) + 1} is no longer over the list.`),
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => (over ? `Rule dropped at position ${(order ?? ids).indexOf(String(active.id)) + 1}.` : `Rule ${ids.indexOf(String(active.id)) + 1} returned to its place.`),
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Reordering cancelled. Rule ${ids.indexOf(String(active.id)) + 1} returned to its place.`,
  };
  const shown = order ?? ids;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setOrder(null)} accessibility={{ announcements, screenReaderInstructions: { draggable: "Press space to pick up a rule, the arrow keys to move it, space again to drop it, or Escape to cancel." } }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="grid gap-3">
          <AnimatePresence initial={false}>
          {editor.rules.map((rule, i) => (
            <SortableRule key={rule.id} rule={rule} i={i} shownIndex={shown.indexOf(rule.id)} editor={editor} lr={byId.get(rule.id)} live={live} now={now} dragging={order !== null} highlighted={highlight === rule.id} change={changes?.find((c) => c.id === rule.id && c.kind === "changed")} onUndo={onUndo} />
          ))}
          </AnimatePresence>
          <button type="button" onClick={onAdd} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-tile)] border-2 border-dashed border-line text-[16px] font-bold text-text transition-colors hover:border-muted active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
            <Plus className="size-5" aria-hidden /> Add rule
          </button>
        </div>
      </SortableContext>
    </DndContext>
  );
}
