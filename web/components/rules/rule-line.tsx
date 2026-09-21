"use client";

/**
 * One rule as a line: `1 IF health < 1.25 → Repay debt · NOW 2.10`. The number is a filled lime disc on the rule
 * a tick would run now, and its right side says when it ran. Desktop keeps it on one row; phones split it in two.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionShort, conditionsCompact } from "@/lib/model/labels";
import type { Rule } from "@/lib/model/autopilot";

export interface RuleLineProps {
  index: number;
  rule: Rule;
  /** The text after NOW, already formatted. */
  now?: string | null;
  /** "2H" when the rule ran, shown instead of NOW. */
  ranAgo?: string | null;
  /** A tick would run this rule now. */
  current?: boolean;
  /** Overrides the right column entirely (the ON / OFF word on the Autopilot page). */
  trailing?: React.ReactNode;
  /** Overrides the NOW column text, e.g. "IN BEST HUB". */
  nowOverride?: string | null;
  dimmed?: boolean;
  /** The draft row in the chat has no place yet, so no number. */
  hideNumber?: boolean;
  className?: string;
}

export function RuleNumber({ index, current, className }: { index: number; current?: boolean; className?: string }) {
  return (
    <span className={cn("mono inline-flex size-6 shrink-0 items-center justify-center rounded-full font-medium", current ? "bg-lime text-on-lime" : "text-lime", className)} aria-label={current ? `Rule ${index}, running now` : `Rule ${index}`}>
      {index}
    </span>
  );
}

export function RuleLine({ index, rule, now, ranAgo, current, trailing, nowOverride, dimmed, hideNumber, className }: RuleLineProps) {
  const status = nowOverride ?? (ranAgo ? `RAN ${ranAgo} AGO` : now ? `NOW ${now}` : null);
  const statusTone = ranAgo && !nowOverride ? "text-lime" : "text-muted";
  return (
    <div className={cn("grid gap-x-4 gap-y-1 py-4 md:grid-cols-[auto_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)_auto_auto] md:items-center", dimmed && "opacity-50", className)}>
      {/* Phone row 1: number, IF condition, status. Desktop: the same items flow into the grid columns. */}
      <div className="flex items-center gap-3 md:contents">
        {hideNumber ? <span className="hidden md:inline" aria-hidden /> : <RuleNumber index={index} current={current} />}
        <span className="mono text-dim">IF</span>
        <span className="mono min-w-0 flex-1 truncate">{conditionsCompact(rule)}</span>
        <span className={cn("mono ml-auto shrink-0 md:hidden", statusTone)}>{trailing ?? status}</span>
      </div>
      <div className="flex items-center gap-2 pl-9 md:contents md:pl-0">
        <ArrowRight className="size-4 shrink-0 text-lime" aria-hidden />
        <span className="min-w-0 truncate text-[16px] font-bold">{actionShort(rule.action)}</span>
        <span className={cn("mono hidden shrink-0 text-right md:inline", statusTone)}>{status}</span>
        <span className="mono hidden shrink-0 md:inline">{trailing}</span>
      </div>
    </div>
  );
}
