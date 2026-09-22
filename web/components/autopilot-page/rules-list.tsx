"use client";

/** The compact list on the live page: one tile, one line per rule, ON or OFF at the end. A tap on a rule opens it in the editor. */
import { Label, PillButton, Tile } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import type { LiveRule } from "@/hooks/use-autopilot-live";
import { agoShort, observedLabel } from "@/lib/model/labels";
import { cn } from "@/lib/utils";

export function RulesHeader({ hint, action }: { hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-[22px] font-bold">Rules</h2>
        <Label className="hidden md:inline">{hint}</Label>
      </div>
      {action}
    </div>
  );
}

export function RulesList({ rules, now, onEdit, onOpen, stopped }: { rules: LiveRule[]; now: number; onEdit: () => void; /** A rule was tapped: open it in the editor. */ onOpen: (id: string) => void; /** The autopilot is stopped: every row greyed, kept for a restart. */ stopped?: boolean }) {
  return (
    <div className="grid gap-3">
      <RulesHeader hint="Top to bottom · first match runs · tap a rule to change it" action={<PillButton variant="ghost" onClick={onEdit}>Edit rules</PillButton>} />
      <Tile padded={false} className="px-5 md:px-7">
        <div className="divide-y divide-line">
          {rules.map((r) => (
            <button
              key={r.rule.id}
              type="button"
              onClick={() => onOpen(r.rule.id)}
              aria-label={`Rule ${r.index}: change it`}
              className="block w-full rounded-lg text-left transition-opacity hover:opacity-90 active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text"
            >
              <RuleLine
                index={r.index}
                rule={r.rule}
                current={r.current}
                ranAgo={r.current && r.lastRunAt ? agoShort(r.lastRunAt, now) : null}
                now={observedLabel(r.rule.conditions[0]!.kind, r.observed)}
                dimmed={!r.rule.enabled || stopped}
                trailing={<span className={cn(r.rule.enabled ? "text-accent-text" : "text-muted")}>{r.rule.enabled ? "ON" : "OFF"}</span>}
              />
            </button>
          ))}
        </div>
      </Tile>
    </div>
  );
}
