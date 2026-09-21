"use client";

/**
 * The Autopilot page: the rules are the page. This is the live view: the status, how long Koul's key still works,
 * and the rules with their live values. Editing, templates, the access popover and the composer follow.
 */
import * as React from "react";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useAgentAccess } from "@/hooks/use-agent-access";
import { Label, Sk, StatusPill, type StatusKind } from "@/components/signal";
import { RulesList } from "@/components/autopilot-page/rules-list";

function AccessLabel() {
  const agent = useAgentAccess();
  const text = !agent.loaded ? "Access" : agent.active ? (agent.daysLeft === null ? "Access" : `Access ${agent.daysLeft}d`) : "No access yet";
  return <span className="inline-flex h-11 items-center rounded-full bg-surface px-4"><Label tone="text">{text}</Label></span>;
}

function useMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function AutopilotPage() {
  const live = useAutopilotLive();
  const now = useMinute();

  if (live.loading && live.status === "off") {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between"><Sk className="h-11 w-28 rounded-full" /><Sk className="h-11 w-36 rounded-full" /></div>
        <Sk className="h-[320px] rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  const kind: StatusKind = live.status === "live" ? "live" : "off";
  const onCount = live.rules.filter((r) => r.rule.enabled).length;
  const summary = live.status === "live"
    ? (live.nowOn !== null ? `${onCount} ${onCount === 1 ? "rule" : "rules"} · now on rule ${live.nowOn}` : `${onCount} ${onCount === 1 ? "rule" : "rules"} · nothing to do right now`)
    : live.status === "paused" ? "Rules saved · no access" : "No rules yet";

  return (
    <div className="grid gap-4 md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill kind={kind} />
          <Label className="hidden sm:inline">{summary}</Label>
        </div>
        <AccessLabel />
      </div>
      <Label className="sm:hidden">{summary}</Label>
      {live.status === "off" ? <Label className="px-2">Nothing to show until the first rule is saved.</Label> : <RulesList rules={live.rules} now={now} onEdit={() => undefined} />}
    </div>
  );
}
