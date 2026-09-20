"use client";

/**
 * A rule as a sentence: when / do / then. The live value sits next to the threshold and turns clay when the
 * condition holds. Anything Koul filled in without being told is marked, never hidden.
 */
import * as React from "react";
import { ArrowDown, ArrowUp, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill, Sk, Term } from "@/components/koul/primitives";
import { actionSentence, conditionSentence, ACTION_LABELS, type ConditionEval, type Rule, type RuleEval } from "@/lib/model/autopilot";
import { fmtCooldown } from "@/lib/format";

const INFERRED_DETAIL = "You did not state this; Koul picked a sensible default. Tap the card to change it.";

/** A value Koul chose on its own: dotted clay underline plus a small tag that explains itself on tap. */
export function InferredMark({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="underline decoration-clay decoration-dotted decoration-[1.5px] underline-offset-4">{children}</span>
      <Term detail={INFERRED_DETAIL} className="no-underline align-baseline">
        <span className={cn("inline-flex h-[18px] items-center whitespace-nowrap rounded-full bg-clay-soft px-1.5 text-[10px] font-medium tracking-wide text-clay", compact && "h-4 px-1")}>Koul filled this in</span>
      </Term>
    </span>
  );
}

/** "now 48.79" next to the threshold: clay when the condition holds, muted when not, warning when unreadable. */
export function NowPill({ ev, className }: { ev: ConditionEval; className?: string }) {
  if (ev.met === null) {
    const label = ev.nowLabel === "—" ? "no reading" : ev.nowLabel;
    return <Pill tone="warning" className={cn("num", className)}>{label}</Pill>;
  }
  const label = ev.nowLabel === "no loan" ? "no loan" : `now ${ev.nowLabel}`;
  return <Pill tone={ev.met ? "clay" : "neutral"} className={cn("num", ev.met && "font-semibold", className)}>{label}</Pill>;
}

export function RuleStatePill({ rule, ev }: { rule: Rule; ev: RuleEval }) {
  if (!rule.enabled) return <Pill tone="outline">Off</Pill>;
  if (ev.wouldRun) return <Pill tone="clay" dot pulse>Would run now</Pill>;
  if (ev.conditions.some((c) => c.met === null) && !ev.conditionsMet) return <Pill tone="warning">No reading</Pill>;
  if (ev.conditionsMet) return <Pill tone="neutral" dot>True, nothing to do</Pill>;
  return <Pill tone="outline">Not true now</Pill>;
}

export interface RuleCardProps {
  rule: Rule;
  ev: RuleEval;
  index: number;
  count: number;
  /** Read-only cards (ended autopilots) have no edit or reorder controls. */
  readOnly?: boolean;
  onEdit?: (rule: Rule) => void;
  onMove?: (index: number, dir: -1 | 1) => void;
  className?: string;
}

export function RuleCard({ rule, ev, index, count, readOnly = false, onEdit, onMove, className }: RuleCardProps) {
  const editable = !readOnly && !!onEdit;
  const open = () => { if (editable) onEdit?.(rule); };
  const onCardClick = (e: React.MouseEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("button, a, input, [data-no-edit]")) return;
    open();
  };
  const position = String(index + 1).padStart(2, "0");
  const actionTech = ACTION_LABELS[rule.action.kind].technical;
  const cooldownInferred = rule.inferred.includes("cooldownSec");

  return (
    <li
      className={cn(
        "relative list-none rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow,opacity] sm:p-5",
        editable && "cursor-pointer hover:border-foreground/25",
        ev.wouldRun && rule.enabled && "glow-ring border-clay/60",
        !rule.enabled && "opacity-60",
        className,
      )}
      onClick={onCardClick}
      aria-label={`Rule ${index + 1}: ${rule.name}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="num shrink-0 text-[11px] tracking-[0.14em] text-muted-foreground" aria-hidden>{position}</span>
          <h3 className="display truncate text-[1.375rem] leading-tight">{rule.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RuleStatePill rule={rule} ev={ev} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[15px] leading-relaxed sm:grid-cols-[3.75rem_minmax(0,1fr)]">
        {rule.conditions.map((c, i) => {
          const s = conditionSentence(c);
          const inferred = rule.inferred.includes(`conditions.${i}.value`);
          const cev = ev.conditions[i] ?? { met: null, now: null, nowLabel: "—" };
          const label = i === 0 ? "when" : rule.match === "all" ? "and" : "or";
          return (
            <React.Fragment key={i}>
              <dt className="pt-[3px] text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>
                  <Term detail={s.technical}>{s.subject}</Term> {s.verb}{" "}
                  {inferred ? <InferredMark><b className="num font-semibold">{s.value}</b></InferredMark> : <b className="num font-semibold">{s.value}</b>}
                </span>
                <NowPill ev={cev} className="self-center" />
              </dd>
            </React.Fragment>
          );
        })}
        <dt className="pt-[3px] text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">do</dt>
        <dd>
          <Term detail={actionTech}>{actionSentence(rule.action)}</Term>
          {typeof rule.action.amount === "number" && <span className="ml-2 text-xs text-warning">Only “everything” can run on-chain today.</span>}
        </dd>
        <dt className="pt-[3px] text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">then</dt>
        <dd className="text-muted-foreground">
          wait {cooldownInferred ? <InferredMark><b className="num font-semibold text-foreground">{fmtCooldown(rule.cooldownSec)}</b></InferredMark> : <b className="num font-semibold text-foreground">{fmtCooldown(rule.cooldownSec)}</b>} before this rule can run again
        </dd>
      </dl>

      {(ev.wouldRun || (ev.conditionsMet && ev.blocker) || !readOnly) && (
        <div className="mt-4 flex items-end justify-between gap-3">
          <p className={cn("min-w-0 text-sm", ev.wouldRun ? "text-clay" : "text-muted-foreground")} aria-live="polite">
            {rule.enabled && ev.wouldRun && <>Koul would {ev.wouldDo}.</>}
            {rule.enabled && !ev.wouldRun && ev.conditionsMet && ev.blocker && <>{ev.blocker}.</>}
            {!rule.enabled && <>Switched off. Koul skips this rule.</>}
          </p>
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-0.5" data-no-edit>
              {onMove && (
                <>
                  <Button variant="ghost" size="icon-lg" className="size-11 text-muted-foreground" aria-label={`Move rule ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, -1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-lg" className="size-11 text-muted-foreground" aria-label={`Move rule ${index + 1} down`} disabled={index >= count - 1} onClick={() => onMove(index, 1)}>
                    <ArrowDown className="size-4" />
                  </Button>
                </>
              )}
              {editable && (
                <Button variant="ghost" size="lg" className="min-h-11 text-muted-foreground" aria-label={`Edit rule ${index + 1}: ${rule.name}`} onClick={open}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function RuleCardSkeleton() {
  return (
    <li className="list-none rounded-xl border border-border bg-card p-4 sm:p-5" aria-busy>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Sk className="h-3 w-5" /><Sk className="h-6 w-28" /></div>
        <Sk className="h-6 w-24 rounded-full" />
      </div>
      <div className="mt-5 grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-3 sm:grid-cols-[3.75rem_minmax(0,1fr)]">
        <Sk className="h-3 w-10" /><div className="flex items-center gap-2"><Sk className="h-4 w-3/5" /><Sk className="h-6 w-20 rounded-full" /></div>
        <Sk className="h-3 w-6" /><Sk className="h-4 w-4/5" />
        <Sk className="h-3 w-9" /><Sk className="h-4 w-1/2" />
      </div>
      <div className="mt-5 flex justify-end gap-1"><Sk className="size-9" /><Sk className="size-9" /><Sk className="h-9 w-16" /></div>
    </li>
  );
}
