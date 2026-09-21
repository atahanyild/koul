"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Label, Sk, StatusDot, Tile, TileLabel } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import type { AutopilotLiveState } from "@/hooks/use-autopilot-live";
import { agoShort, observedLabel } from "@/lib/model/labels";
import { cn } from "@/lib/utils";

const SHOWN = 4;

/** Read-only. Watching with the first four rules, or the dashed Off tile. The whole tile leads to Autopilot. */
export function AutopilotTile({ ap, now }: { ap: AutopilotLiveState; now: number }) {
  if (ap.loading && ap.status === "off") {
    return (
      <Tile className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <div><TileLabel>Autopilot</TileLabel><Sk className="mt-4 h-12 w-48 rounded-xl" /><Sk className="mt-4 h-3.5 w-24" /></div>
        <div className="divide-y divide-line">{[0, 1, 2].map((i) => <div key={i} className="flex items-center justify-between py-5"><Sk className="h-4 w-56" /><Sk className="h-4 w-20" /></div>)}</div>
      </Tile>
    );
  }
  if (ap.status === "off") return null;
  const on = ap.rules.filter((r) => r.rule.enabled).length;
  const more = ap.rules.length - SHOWN;
  const paused = ap.status === "paused";
  return (
    <Link href="/autopilot" className="block rounded-[var(--radius-tile)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime" aria-label="Autopilot">
      <Tile className="grid gap-6 transition-colors hover:bg-surface-2/60 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
        <div>
          <TileLabel>Autopilot</TileLabel>
          <div className="mt-2 flex items-center gap-3"><StatusDot on={!paused} size="md" /><span className="t-value">{paused ? "Paused" : "Watching"}</span></div>
          <div className="mt-3 flex flex-col gap-1">
            <Label>{on} {on === 1 ? "rule" : "rules"} on{paused ? " · no access" : ""}</Label>
            {ap.nowOn !== null ? <Label>Now on rule {ap.nowOn}</Label> : <Label>Nothing to do right now</Label>}
          </div>
        </div>
        <div className="divide-y divide-line">
          {ap.rules.slice(0, SHOWN).map((r) => (
            <RuleLine key={r.rule.id} index={r.index} rule={r.rule} current={r.current} ranAgo={r.current && r.lastRunAt ? agoShort(r.lastRunAt, now) : null} now={observedLabel(r.rule.conditions[0]!.kind, r.observed)} />
          ))}
          {more > 0 && (
            <div className={cn("flex items-center justify-between pt-4")}>
              <Label tone="lime">+{more} more {more === 1 ? "rule" : "rules"}</Label>
              <ArrowRight className="size-4 text-lime" aria-hidden />
            </div>
          )}
        </div>
      </Tile>
    </Link>
  );
}
