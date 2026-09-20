"use client";

/**
 * One autopilot in the list: its name, where it stands (armed, paused, draft, ended), a one-line summary, and the
 * one fact that matters right now, whether any rule would run if the keeper ticked this second.
 */
import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CardLink, Pill, Sk, LiveDot, type PillTone } from "@/components/koul/primitives";
import { evaluateAutopilot, type Autopilot, type AutopilotStatus, type LiveValues } from "@/lib/model/autopilot";
import { fmtDuration, fmtRelative } from "@/lib/format";
import { Numbered } from "@/components/activity/numbered";

export const STATUS: Record<AutopilotStatus, { label: string; tone: PillTone; dot: boolean; pulse: boolean }> = {
  armed: { label: "Armed", tone: "clay", dot: true, pulse: true },
  paused: { label: "Paused", tone: "warning", dot: true, pulse: false },
  draft: { label: "Draft", tone: "neutral", dot: false, pulse: false },
  ended: { label: "Ended", tone: "neutral", dot: false, pulse: false },
};

export function StatusPill({ status, className }: { status: AutopilotStatus; className?: string }) {
  const s = STATUS[status];
  return <Pill tone={s.tone} dot={s.dot} pulse={s.pulse} className={className}>{s.label}</Pill>;
}

/** "3 rules · key valid 6 d 19 h · last run 12 min ago" as separate pieces so the page can join them with a dot. */
export function summarize(ap: Autopilot, now: number): string[] {
  const n = ap.rules.length;
  const parts = [`${n} rule${n === 1 ? "" : "s"}`];
  switch (ap.status) {
    case "armed":
      parts.push(ap.armedUntil ? `key valid ${fmtDuration(Math.max(0, (ap.armedUntil - now) / 1000))}` : "key valid");
      break;
    case "paused":
      parts.push("key not active");
      break;
    case "draft":
      parts.push(`written ${fmtRelative(ap.createdAt, now)}`);
      break;
    case "ended":
      parts.push(ap.armedUntil ? `ended ${fmtRelative(ap.armedUntil, now)}` : "ended");
      break;
  }
  if (ap.lastRunAt) parts.push(`last run ${fmtRelative(ap.lastRunAt, now)}`);
  else if (ap.status === "armed" || ap.status === "paused") parts.push("no runs yet");
  else if (ap.status === "ended") parts.push(ap.runs ? `${ap.runs} run${ap.runs === 1 ? "" : "s"}` : "never ran");
  return parts;
}

export function AutopilotCard({ ap, live, liveLoading, now, className }: { ap: Autopilot; live: LiveValues; liveLoading: boolean; now: number; className?: string }) {
  const ev = React.useMemo(() => evaluateAutopilot(ap, live), [ap, live]);
  const firingIndex = ev.firing ? ap.rules.findIndex((r) => r.id === ev.firing!.ruleId) + 1 : 0;
  const showDecision = ap.status !== "ended";
  const prefix = ap.status === "draft" ? "If armed now" : "Right now";
  const summary = summarize(ap, now);

  return (
    <CardLink href={`/autopilots/${ap.id}`} className={cn("group/ap flex h-full flex-col", ev.firing && ap.status === "armed" && "glow-ring border-clay/40", className)}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="display min-w-0 truncate text-[1.375rem] leading-tight">{ap.name}</h3>
        <StatusPill status={ap.status} className="mt-0.5" />
      </div>

      <p className="mt-1.5 text-[13px] text-muted-foreground">
        {summary.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="mx-1.5 opacity-60" aria-hidden>·</span>}
            <span className="whitespace-nowrap"><Numbered text={s} /></span>
          </React.Fragment>
        ))}
      </p>

      {ap.rules.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Rules">
          {ap.rules.map((r, i) => {
            const isFiring = ev.firing?.ruleId === r.id;
            return (
              <li key={r.id}>
                <Pill tone={isFiring ? "clay" : "outline"} className={cn(!r.enabled && "line-through opacity-60")}>
                  <span className="num opacity-60">{i + 1}</span>
                  {r.name}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}

      {showDecision && (
        <div className="mt-auto pt-4">
          {liveLoading ? (
            <Sk className="h-4 w-56 max-w-full" />
          ) : (
            <p className={cn("flex items-start gap-2 text-sm leading-snug", ev.firing ? "text-clay" : "text-muted-foreground")} aria-live="polite">
              {ev.firing ? <LiveDot tone="clay" className="mt-[5px]" /> : <span className="mt-[6px] inline-flex size-2 shrink-0 rounded-full border border-current opacity-50" aria-hidden />}
              <span className="min-w-0">
                {ev.firing ? (
                  <>
                    {prefix} rule <span className="num">{firingIndex}</span> would run: <Numbered text={ev.firing.wouldDo} />
                  </>
                ) : (
                  <>{prefix}: nothing would run</>
                )}
              </span>
              <ChevronRight className="ml-auto mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover/ap:translate-x-0.5" aria-hidden />
            </p>
          )}
        </div>
      )}
      {!showDecision && (
        <div className="mt-auto flex items-center justify-end pt-4">
          <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover/ap:translate-x-0.5" aria-hidden />
        </div>
      )}
    </CardLink>
  );
}

export function AutopilotCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-busy>
      <div className="flex items-start justify-between gap-3">
        <Sk className="h-6 w-36" />
        <Sk className="h-6 w-16 rounded-full" />
      </div>
      <Sk className="mt-3 h-3 w-3/4" />
      <div className="mt-4 flex gap-1.5">
        <Sk className="h-6 w-20 rounded-full" />
        <Sk className="h-6 w-20 rounded-full" />
        <Sk className="h-6 w-20 rounded-full" />
      </div>
      <Sk className="mt-5 h-4 w-1/2" />
    </div>
  );
}
