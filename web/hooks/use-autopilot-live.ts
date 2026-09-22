"use client";

/**
 * The wallet's autopilot as the chain sees it right now: the stored rules, `check` per rule (ready, holds, the
 * observed value), what a tick would run, when each rule last ran, and whether Koul's key is active. One wallet
 * has one autopilot in this app; when the router holds several, the lowest id is the one shown.
 */
import { useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { KoulReader, type Executed, type RuleState } from "@koul/core";
import { usePoll } from "@/lib/data/store";
import { READ_CONFIG } from "@/lib/koul";
import { readCheck, type ChainAutopilot } from "@/lib/data/live";
import { foldCoreRules, type Rule } from "@/lib/model/autopilot";
import { useChainAutopilots } from "./use-portfolio";
import { useAgentAccess } from "./use-agent-access";
import { useActivity, type ActivityRow } from "./use-activity";

const reader = new KoulReader(READ_CONFIG);

/** live: rules stored and the key active. paused: rules stored, no key. off: nothing stored. */
export type AutopilotStatus = "live" | "paused" | "off";

export interface LiveRule {
  /** 1-based position on the page. */
  index: number;
  rule: Rule;
  /** Contract rule indexes this card stands for (a "move to the better hub" card is two on-chain rules). */
  contractIndexes: number[];
  ready: boolean;
  holds: boolean;
  /** The first condition's observed value from `check`, in contract units. */
  observed: bigint | null;
  /** Every condition of the rule with what `check` saw for it, in the rule's own order. */
  conditions: { holds: boolean; observed: bigint | null }[];
  lastRunAt: number | null;
  /** The Activity row of the last run: what moved and how much. */
  lastRun: ActivityRow | null;
  /** This is the rule a tick would run now. */
  current: boolean;
}

export interface AutopilotLiveState {
  status: AutopilotStatus;
  loading: boolean;
  error: Error | null;
  chainId: number | null;
  chain: ChainAutopilot | null;
  rules: LiveRule[];
  /** 1-based index of the rule a tick would run, or null. */
  nowOn: number | null;
  /** Ledger states straight from `check`, per contract rule. */
  states: RuleState[] | null;
  access: { active: boolean; daysLeft: number | null; ruleId: number | null; loaded: boolean };
  refresh: () => Promise<void>;
}

export function useAutopilotLive(): AutopilotLiveState {
  const { address, isConnected, txEpoch } = usePasskeyWallet();
  const chain = useChainAutopilots();
  const agent = useAgentAccess();
  const activity = useActivity();
  const primary = useMemo(() => (chain.list.length ? chain.list.reduce((a, b) => (b.id < a.id ? b : a)) : null), [chain.list]);
  const id = primary?.id ?? null;

  const check = usePoll<RuleState[]>(isConnected && address && id !== null ? `check:${address}:${id}` : null, () => readCheck(address!, id!), { intervalMs: 15_000, enabled: isConnected && id !== null, deps: [txEpoch] });
  const tick = usePoll<Executed | null>(isConnected && address && id !== null ? `tick:${address}:${id}` : null, () => reader.simulateTick(address!, id!).catch(() => null), { intervalMs: 30_000, enabled: isConnected && id !== null, deps: [txEpoch] });

  return useMemo(() => {
    const access = { active: agent.active !== null, daysLeft: agent.daysLeft, ruleId: agent.active?.ruleId ?? null, loaded: agent.loaded };
    const refresh = async () => { await Promise.all([chain.refresh(), check.refresh(), tick.refresh(), agent.refresh()]); };
    if (!primary) {
      return { status: "off" as const, loading: chain.loading, error: chain.error, chainId: null, chain: null, rules: [], nowOn: null, states: null, access, refresh };
    }
    const { rules, contractToUi } = foldCoreRules(primary.autopilot);
    const states = check.data ?? null;
    const lastRun = new Map<number, ActivityRow>();
    for (const row of activity.rows) {
      if (row.kind !== "run" || row.autopilotId !== primary.id || row.ruleIndex === undefined) continue;
      const ui = contractToUi[row.ruleIndex];
      if (ui === undefined) continue;
      const seen = lastRun.get(ui);
      if (!seen || row.at > seen.at) lastRun.set(ui, row);
    }
    let nowOnUi: number | null = null;
    if (tick.data) nowOnUi = contractToUi[tick.data.rule_index] ?? null;
    else if (states) {
      const i = states.findIndex((s) => s.ready && s.holds);
      if (i >= 0) nowOnUi = contractToUi[i] ?? null;
    }
    const live: LiveRule[] = rules.map((rule, ui) => {
      const contractIndexes = contractToUi.map((u, ci) => (u === ui ? ci : -1)).filter((ci) => ci >= 0);
      const mine = states ? contractIndexes.map((ci) => states[ci]).filter((s): s is RuleState => !!s) : [];
      // The contract rule that holds (or the first) speaks for the card: its conditions line up with the rule's own.
      const voice = mine.length ? (mine.find((s) => s.holds) ?? mine[0]!) : null;
      return {
        index: ui + 1,
        rule,
        contractIndexes,
        ready: mine.some((s) => s.ready),
        holds: mine.some((s) => s.holds),
        observed: voice?.conditions[0]?.observed ?? null,
        conditions: rule.conditions.map((_, k) => ({ holds: voice?.conditions[k]?.holds ?? false, observed: voice?.conditions[k]?.observed ?? null })),
        lastRunAt: lastRun.get(ui)?.at ?? null,
        lastRun: lastRun.get(ui) ?? null,
        current: nowOnUi === ui,
      };
    });
    const status: AutopilotStatus = agent.active ? "live" : "paused";
    return { status, loading: chain.loading || (check.data === undefined && !check.error), error: chain.error ?? check.error, chainId: primary.id, chain: primary, rules: live, nowOn: nowOnUi === null ? null : nowOnUi + 1, states, access, refresh };
  }, [primary, chain, check, tick, agent, activity.rows]);
}
