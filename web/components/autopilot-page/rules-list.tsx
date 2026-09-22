"use client";

/** The compact read-only list on the live page: one tile, one line per rule, ON or OFF at the end. */
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

export function RulesList({ rules, now, onEdit }: { rules: LiveRule[]; now: number; onEdit: () => void }) {
  return (
    <div className="grid gap-3">
      <RulesHeader hint="Top to bottom · first match runs" action={<PillButton variant="ghost" onClick={onEdit}>Edit rules</PillButton>} />
      <Tile padded={false} className="px-5 md:px-7">
        <div className="divide-y divide-line">
          {rules.map((r) => (
            <RuleLine
              key={r.rule.id}
              index={r.index}
              rule={r.rule}
              current={r.current}
              ranAgo={r.current && r.lastRunAt ? agoShort(r.lastRunAt, now) : null}
              now={observedLabel(r.rule.conditions[0]!.kind, r.observed)}
              dimmed={!r.rule.enabled}
              trailing={<span className={cn(r.rule.enabled ? "text-accent-text" : "text-muted")}>{r.rule.enabled ? "ON" : "OFF"}</span>}
            />
          ))}
        </div>
      </Tile>
    </div>
  );
}
