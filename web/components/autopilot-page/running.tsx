"use client";

/**
 * The live page's first tile: what the autopilot is doing right now. Watching or Paused, the rule a tick would run
 * with each of its conditions against the value the router just read, what it does and how long it waits, the
 * last run, and when the keeper checks again. No composer here: the rules are changed from the list below.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { KeyValue, Label, StatusDot, Tile, TileLabel } from "@/components/signal";
import { RuleNumber } from "@/components/rules/rule-line";
import type { AutopilotLiveState, LiveRule } from "@/hooks/use-autopilot-live";
import { actionShort, agoShort, conditionCompact, cooldownShort, observedLabel, whenLabel } from "@/lib/model/labels";
import { capitalOf } from "@/lib/model/capital";
import { cn } from "@/lib/utils";

/** The keeper ticks every five minutes. */
const CHECK_EVERY = "5 min";

function Conditions({ r }: { r: LiveRule }) {
  return (
    <div className="divide-y divide-line">
      {r.rule.conditions.map((c, k) => {
        const state = r.conditions[k];
        const observed = state ? observedLabel(c.kind, state.observed) : null;
        return (
          <KeyValue
            key={k}
            label={<span>{k === 0 ? "If" : r.rule.match === "all" ? "and" : "or"} <span className="text-text">{conditionCompact(c)}</span></span>}
            value={observed === null ? "NO READING" : `NOW ${observed}`}
            tone={observed === null ? "dim" : state?.holds ? "lime" : "muted"}
          />
        );
      })}
    </div>
  );
}

export function Running({ ap, now, actions }: { ap: AutopilotLiveState; now: number; /** Pause, Give access, Save to library, Delete. */ actions?: React.ReactNode }) {
  const paused = ap.status === "paused";
  const current = ap.rules.find((r) => r.current) ?? null;
  const on = ap.rules.filter((r) => r.rule.enabled).length;
  const capital = capitalOf(ap.rules.map((r) => r.rule));
  const lastRun = ap.rules.map((r) => r.lastRun).filter((r): r is NonNullable<typeof r> => r !== null).sort((a, b) => b.at - a.at)[0] ?? null;
  return (
    <Tile className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8">
      <div>
        <TileLabel>Autopilot</TileLabel>
        <div className="mt-2 flex items-center gap-3"><StatusDot on={!paused} size="md" /><span className="t-value">{paused ? "Stopped" : "Watching"}</span></div>
        <div className="mt-3 grid gap-1">
          <Label>{on} {on === 1 ? "rule" : "rules"} {paused ? "kept" : "on"}</Label>
          <Label>{paused ? "Nothing runs until you start it again" : `Checked every ${CHECK_EVERY}`}</Label>
          {capital !== null && <Label>{capital === "mixed" ? "Moves use a different share per rule" : capital >= 100 ? "Each move uses everything that rule can see" : `Each move uses up to ${capital}% of what that rule can see`}</Label>}
          {ap.access.active && ap.access.daysLeft !== null && <Label>Access {ap.access.daysLeft}D left</Label>}
        </div>
        {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="grid gap-4">
        {current ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <RuleNumber index={current.index} current markerId="running-rule" />
              <span className="label text-text">{paused ? "Would run now" : "Running now"}</span>
              <span className="mono ml-auto text-muted">WAIT {cooldownShort(current.rule.cooldownSec).toUpperCase()}</span>
            </div>
            <Conditions r={current} />
            <div className="flex items-center gap-2 border-t border-line pt-4">
              <ArrowRight className="size-4 shrink-0 text-accent-text" aria-hidden />
              <span className="text-[18px] font-bold">{actionShort(current.rule.action)}</span>
              {current.lastRunAt && <span className="mono ml-auto text-accent-text">RAN {agoShort(current.lastRunAt, now)} AGO</span>}
            </div>
          </>
        ) : (
          <div className="grid gap-2 py-2">
            <span className="text-[22px] font-bold leading-tight md:text-[26px]">Nothing to do right now.</span>
            <Label>Every rule is off or its condition does not hold. The values beside each rule are live.</Label>
          </div>
        )}
        {lastRun && (
          <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4")}>
            <Label>Last run · {whenLabel(lastRun.at, now)}</Label>
            <span className="mono text-text">{lastRun.title}{lastRun.amount !== undefined ? ` · ${Math.abs(lastRun.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : ""}</span>
          </div>
        )}
      </div>
    </Tile>
  );
}
