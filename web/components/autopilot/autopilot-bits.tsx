"use client";

/**
 * The small parts of the autopilot page: status pill, the inline-editable name, the key validity, the "checked"
 * line, the decision banner, notices, the runs list and the loading skeleton.
 */
import * as React from "react";
import Link from "next/link";
import { Check, ChevronLeft, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LiveDot, Pill, Sk, Term, TxLink, type PillTone } from "@/components/koul/primitives";
import type { ActivityItem } from "@/lib/data/types";
import type { Autopilot, AutopilotEval, AutopilotStatus } from "@/lib/model/autopilot";
import { fmtDateTime, fmtDuration, fmtRelative } from "@/lib/format";
import { RuleCardSkeleton } from "./rule-card";

/** A clock that ticks every `intervalMs`, for relative times and countdowns. */
export function useNow(intervalMs = 20_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

// ---------------------------------------------------------------- header

const STATUS: Record<AutopilotStatus, { label: string; tone: PillTone; dot: boolean; pulse: boolean }> = {
  draft: { label: "Draft", tone: "outline", dot: false, pulse: false },
  armed: { label: "Armed", tone: "clay", dot: true, pulse: true },
  paused: { label: "Paused", tone: "warning", dot: true, pulse: false },
  ended: { label: "Ended", tone: "neutral", dot: false, pulse: false },
};

export function StatusPill({ status }: { status: AutopilotStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone} dot={s.dot} pulse={s.pulse}>{s.label}</Pill>;
}

export function BackEyebrow({ href = "/autopilots", children = "Autopilots" }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex min-h-8 items-center gap-0.5 rounded-md pr-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <ChevronLeft className="size-3.5" aria-hidden /> {children}
    </Link>
  );
}

/** The serif title. For drafts, tapping it (or the pencil) turns it into an input; Enter saves, Escape cancels. */
export function EditableName({ name, editable, onRename }: { name: string; editable: boolean; onRename: (name: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(name);
  const start = () => { setText(name); setEditing(true); };
  const save = () => {
    const next = text.trim();
    setEditing(false);
    if (next && next !== name) onRename(next);
  };
  if (!editable) return <span>{name}</span>;
  if (editing) {
    return (
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") { e.preventDefault(); setEditing(false); } }}
        aria-label="Autopilot name"
        maxLength={48}
        className="display w-full min-w-0 max-w-[16ch] rounded-sm border-b border-clay bg-transparent text-[2rem] leading-none tracking-tight outline-none sm:text-[2.5rem]"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={start} title="Rename" className="display rounded-sm text-left decoration-dotted decoration-muted-foreground/60 underline-offset-8 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {name}
      </button>
      <Button variant="ghost" size="icon-lg" className="size-11 shrink-0 text-muted-foreground" aria-label="Rename autopilot" onClick={start}>
        <Pencil className="size-4" />
      </Button>
    </span>
  );
}

/** "Koul's key valid 6 d 19 h" with the on-chain rule and policy one tap away. */
export function KeyValidity({ ap, now }: { ap: Autopilot; now: number }) {
  if (ap.status !== "armed" || !ap.armedUntil) return null;
  const left = Math.max(0, (ap.armedUntil - now) / 1000);
  const detail = (
    <>
      Context rule{ap.agentRuleId !== null ? ` #${ap.agentRuleId}` : ""} on your smart account: the keeper&apos;s Ed25519 key, bound to koul_agent_policy (an allowlist of router.tick and the XOXNO controller calls, transfers only to the pool, at most 40 calls per 2,000 ledgers). Expires at ledger ≈ {fmtDateTime(ap.armedUntil)}; after that every call it signs is rejected.
    </>
  );
  return (
    <Term detail={detail} className="no-underline">
      <Pill tone="outline" className="gap-1">
        <span>Koul&apos;s key valid</span> <span className="num text-foreground">{fmtDuration(left)}</span>
      </Pill>
    </Term>
  );
}

export function CheckedAgo({ at, now, loading }: { at: number; now: number; loading?: boolean }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground" aria-live="polite">
      <LiveDot tone={loading ? "muted" : "positive"} />
      {loading ? "Checking" : <>Checked <span className="num">{fmtRelative(at, now)}</span></>}
    </span>
  );
}

// ---------------------------------------------------------------- decision banner

const CHECK_DETAIL = "The keeper calls router.tick roughly every 2 to 3 minutes. The router evaluates the saved rules in order (loan health, then the pool gap, then the exit level) and executes the first one whose condition holds, then applies that rule's cooldown.";

export function DecisionBanner({ ap, evaluation, loading, className }: { ap: Autopilot; evaluation: AutopilotEval; loading: boolean; className?: string }) {
  if (loading) {
    return <div className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)} aria-busy><Sk className="h-5 w-3/4" /><Sk className="mt-2 h-3 w-1/2" /></div>;
  }
  if (ap.status === "ended") {
    return (
      <div role="status" className={cn("rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground sm:p-5", className)}>
        This autopilot has ended. Nothing runs. The rules stay here so you can copy them into a new draft.
      </div>
    );
  }
  const firing = evaluation.firing;
  const n = firing ? ap.rules.findIndex((r) => r.id === firing.ruleId) + 1 : 0;
  const armed = ap.status === "armed";
  const lead = armed ? "Right now" : "Once armed, right now";
  if (firing) {
    return (
      <div role="status" aria-live="polite" className={cn("flex items-start gap-3 rounded-xl border border-clay/50 bg-clay-soft p-4 sm:p-5", className)}>
        <LiveDot tone="clay" className="mt-2" />
        <p className="text-[15px] leading-relaxed">
          <span className="display text-xl">{lead} rule <span className="num">{n}</span> would run:</span>{" "}
          <span className="text-foreground">{firing.wouldDo}.</span>
          {!armed && <span className="block text-sm text-muted-foreground">It is not armed, so nothing happens until you arm it.</span>}
        </p>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={cn("flex items-start gap-3 rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <LiveDot tone="muted" className="mt-2" />
      <p className="text-[15px] leading-relaxed">
        <span className="display text-xl">{lead} nothing would run.</span>{" "}
        <span className="text-muted-foreground">
          Koul checks every few minutes, <Term detail={CHECK_DETAIL}>top to bottom</Term>, and runs the first rule that is true.
        </span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- notices

export function Notice({ tone = "warning", children, actions, onDismiss, className }: { tone?: "warning" | "clay" | "neutral"; children: React.ReactNode; actions?: React.ReactNode; onDismiss?: () => void; className?: string }) {
  const tones = {
    warning: "border-warning/40 bg-warning-soft text-foreground",
    clay: "border-clay/40 bg-clay-soft text-foreground",
    neutral: "border-border bg-card text-foreground",
  };
  return (
    <div role="status" className={cn("flex flex-col gap-3 rounded-xl border p-4 text-sm sm:flex-row sm:items-center", tones[tone], className)}>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {(actions || onDismiss) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {actions}
          {onDismiss && (
            <Button variant="ghost" size="icon-lg" className="size-10 text-muted-foreground" aria-label="Dismiss" onClick={onDismiss}><X className="size-4" /></Button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- runs

export function RunsList({ items, status, now, loading }: { items: ActivityItem[]; status: AutopilotStatus; now: number; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card" aria-busy>
        {[0, 1].map((i) => <div key={i} className="flex items-center justify-between gap-3 p-4"><div className="flex-1"><Sk className="h-4 w-2/3" /><Sk className="mt-2 h-3 w-1/3" /></div><Sk className="h-4 w-14" /></div>)}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        {status === "armed" ? <><LiveDot tone="positive" /> No runs yet. Koul is checking.</> : <>No runs.</>}
      </div>
    );
  }
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card">
      {items.map((it) => (
        <li key={it.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive"><Check className="size-3" aria-hidden /></span>
              <span className="truncate">{it.title}</span>
            </div>
            <div className="mt-1 pl-7 text-xs text-muted-foreground">
              {it.ruleName ? <>Rule “{it.ruleName}” · </> : null}<span className="num">{fmtRelative(it.at, now)}</span>
            </div>
          </div>
          {it.txHash && <TxLink hash={it.txHash} className="shrink-0" />}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- permissions (shared by the page aside and the arm sheet)

export function CanList({ items, tone = "positive", icon: Icon = Check, className }: { items: string[]; tone?: "positive" | "muted"; icon?: React.ComponentType<{ className?: string }>; className?: string }) {
  return (
    <ul className={cn("grid gap-2 text-sm", className)}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2.5">
          <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", tone === "positive" ? "bg-positive-soft text-positive" : "bg-surface-2 text-muted-foreground")}>
            <Icon className="size-2.5" />
          </span>
          <span className="leading-snug">{t}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- skeleton

export function AutopilotPageSkeleton() {
  return (
    <div aria-busy aria-label="Loading autopilot">
      <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Sk className="mb-3 h-3 w-20" />
          <div className="flex items-center gap-3"><Sk className="h-9 w-48" /><Sk className="h-6 w-16 rounded-full" /><Sk className="h-6 w-32 rounded-full" /></div>
        </div>
        <div className="hidden gap-2 md:flex"><Sk className="h-9 w-24" /><Sk className="h-9 w-32" /></div>
      </header>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-8 rounded-xl border border-border bg-card p-4 sm:mb-10 sm:p-5"><Sk className="h-5 w-3/4" /><Sk className="mt-2 h-3 w-1/2" /></div>
          <Sk className="mb-3 h-3 w-12" />
          <ol className="grid gap-3"><RuleCardSkeleton /><RuleCardSkeleton /><RuleCardSkeleton /></ol>
        </div>
        <aside className="mt-8 lg:mt-0">
          <Sk className="mb-3 h-3 w-24" />
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5"><Sk className="h-5 w-full" /><Sk className="mt-2 h-5 w-5/6" /><Sk className="mt-2 h-5 w-2/3" /></div>
          <Sk className="mt-8 mb-3 h-3 w-16" />
          <div className="rounded-xl border border-border bg-card p-4"><Sk className="h-4 w-2/3" /><Sk className="mt-2 h-3 w-1/3" /></div>
        </aside>
      </div>
    </div>
  );
}
