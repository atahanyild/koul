"use client";

/**
 * Autopilots = local drafts (this browser) + the one the chain knows about for this wallet + the sample story in
 * demo mode. The chain's rule set is read back through `fromRouterRules`; arming writes through `toRouterRules`.
 */
import { useCallback, useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { createLocalStore } from "@/lib/data/store";
import { mockAutopilots } from "@/lib/data/mock";
import { buildSetRules } from "@/lib/data/live";
import { fromRouterRules, toRouterRules, newId, type Autopilot, type Rule, type RouterRules } from "@/lib/model/autopilot";
import type { Source } from "@/lib/data/types";
import { useDemoMode } from "./use-demo-mode";
import { useAgentAccess } from "./use-agent-access";
import { useRouterRules } from "./use-portfolio";
import { usePasskeyAction } from "./use-passkey-action";

const drafts = createLocalStore<Autopilot[]>("koul.autopilots", []);
export const CHAIN_AUTOPILOT_ID = "on-chain";

export interface AutopilotsState {
  autopilots: Autopilot[];
  source: Source;
  loading: boolean;
  error: Error | null;
  connected: boolean;
}

function chainAutopilot(rules: RouterRules, agent: ReturnType<typeof useAgentAccess>["active"], local: Autopilot | undefined): Autopilot {
  const base: Autopilot = {
    id: CHAIN_AUTOPILOT_ID,
    name: local?.name ?? "Lira shield",
    description: local?.description ?? "Keep my USDC in whichever pool pays more, never let my loan health drop under 1.25, and if the lira goes past 50 pull everything back to my wallet.",
    rules: fromRouterRules(rules).map((r) => ({ ...r, inferred: local?.rules.find((l) => l.id === r.id)?.inferred ?? r.inferred })),
    status: agent ? "armed" : "paused",
    createdAt: local?.createdAt ?? Date.now(),
    armedUntil: agent?.secondsLeft !== null && agent ? Date.now() + agent.secondsLeft * 1000 : null,
    agentRuleId: agent?.ruleId ?? null,
    runs: local?.runs ?? 0,
    lastRunAt: local?.lastRunAt ?? null,
  };
  return base;
}

export function useAutopilots(): AutopilotsState {
  const { isConnected } = usePasskeyWallet();
  const [demo] = useDemoMode();
  const [local] = drafts.use();
  const rr = useRouterRules();
  const agent = useAgentAccess();

  return useMemo(() => {
    const localOnly = local.filter((a) => a.id !== CHAIN_AUTOPILOT_ID);
    const mocks = () => mockAutopilots().filter((m) => !local.some((l) => l.id === m.id));
    if (!isConnected) {
      const list = demo ? [...localOnly, ...mocks()] : localOnly;
      return { autopilots: list, source: "mock", loading: false, error: null, connected: false };
    }
    if (rr.loading || rr.rules === undefined) return { autopilots: [], source: "live", loading: true, error: null, connected: true };
    const chain = rr.rules ? [chainAutopilot(rr.rules, agent.active, local.find((a) => a.id === CHAIN_AUTOPILOT_ID))] : [];
    if (chain.length || !demo) return { autopilots: [...chain, ...localOnly], source: "live", loading: false, error: rr.error, connected: true };
    return { autopilots: [...localOnly, ...mocks()], source: "mock", loading: false, error: rr.error, connected: true };
  }, [isConnected, demo, local, rr.loading, rr.rules, rr.error, agent.active]);
}

export function useAutopilot(id: string): { autopilot: Autopilot | null; loading: boolean; source: Source } {
  const s = useAutopilots();
  const ap = s.autopilots.find((a) => a.id === id) ?? null;
  return { autopilot: ap, loading: s.loading, source: s.source };
}

/** Local edits: create, update rules, rename, reorder. Persisted in this browser until armed on-chain. */
export function useAutopilotEditor() {
  const [, setLocal] = drafts.use();
  const create = useCallback((partial: Partial<Autopilot> & { rules: Rule[] }): Autopilot => {
    const ap: Autopilot = { id: newId("ap"), name: "Untitled autopilot", description: "", status: "draft", createdAt: Date.now(), armedUntil: null, agentRuleId: null, runs: 0, lastRunAt: null, ...partial };
    setLocal((prev) => [ap, ...prev]);
    return ap;
  }, [setLocal]);
  /**
   * Patch an autopilot. Unknown ids are seeded from the sample story or from `seed` (pass the autopilot you are
   * showing, e.g. the on-chain one), so editing any autopilot creates a local copy that shadows it.
   */
  const update = useCallback((id: string, patch: Partial<Autopilot> | ((a: Autopilot) => Autopilot), seed?: Autopilot) => {
    setLocal((prev) => {
      const exists = prev.some((a) => a.id === id);
      const seedFrom = exists ? null : seed && seed.id === id ? seed : mockAutopilots().find((a) => a.id === id) ?? null;
      const list = exists ? prev : seedFrom ? [seedFrom, ...prev] : prev;
      return list.map((a) => (a.id === id ? (typeof patch === "function" ? patch(a) : { ...a, ...patch }) : a));
    });
  }, [setLocal]);
  const remove = useCallback((id: string) => setLocal((prev) => prev.filter((a) => a.id !== id)), [setLocal]);
  return { create, update, remove };
}

/**
 * Arming = two passkey confirmations: grant the agent key (if not already active), then `set_rules` on the router.
 * Returns the rules the router could not express so the sheet can say so before the first prompt.
 */
export function useArmAutopilot() {
  const { kit, address } = usePasskeyWallet();
  const agent = useAgentAccess();
  const rr = useRouterRules();
  const setRules = usePasskeyAction();

  const preview = useCallback((ap: Autopilot, accountId: bigint) => toRouterRules(ap, accountId), []);

  const arm = useCallback(async (ap: Autopilot, opts: { days: number; accountId: bigint }) => {
    if (!kit || !address) return { ok: false as const, step: "wallet" as const };
    const { rules } = toRouterRules(ap, opts.accountId);
    let grantHash: string | null = null;
    if (!agent.active) {
      const g = await agent.grant(opts.days);
      if (!g) return { ok: false as const, step: "grant" as const };
      grantHash = g.hash;
    }
    const res = await setRules.run(() => buildSetRules(address, rules), { title: "Rules saved on-chain", description: `${ap.rules.length} rule${ap.rules.length === 1 ? "" : "s"} for ${ap.name}.`, invalidatePrefixes: ["rules:", "positions:"] });
    if (!res) return { ok: false as const, step: "rules" as const, grantHash };
    // The chain now holds these rules: keep one local record under the on-chain id (name, description, inferred
    // marks) and drop the draft it came from.
    const armed: Autopilot = { ...ap, id: CHAIN_AUTOPILOT_ID, status: "armed", armedUntil: Date.now() + opts.days * 86400_000, agentRuleId: agent.active?.ruleId ?? null };
    drafts.set((prev) => [armed, ...prev.filter((a) => a.id !== ap.id && a.id !== CHAIN_AUTOPILOT_ID)]);
    return { ok: true as const, grantHash, rulesHash: res.hash };
  }, [kit, address, agent, setRules]);

  const pause = useCallback(async () => {
    if (!agent.active) return null;
    return agent.revoke(agent.active.ruleId);
  }, [agent]);

  return { arm, pause, preview, agent, grantAction: agent.action, rulesAction: setRules, routerRules: rr };
}
