"use client";

/**
 * Grant and revoke the Koul agent key on the connected smart account: `rules.add` with the keeper's Ed25519 key
 * bound to koul_agent_policy (pinned to the user's XOXNO account and to the calls the autopilot needs), `rules.remove`.
 */
import { useCallback, useMemo } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContextRule } from "smart-account-kit";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { KoulWriter, type Autopilot as CoreAutopilot } from "@koul/core";
import { KOUL, LEDGER_SECONDS, WRITE_CONFIG } from "@/lib/koul";
import { agentRulesOf } from "@/lib/data/live";
import { usePoll } from "@/lib/data/store";
import { usePasskeyAction } from "./use-passkey-action";

const RULE_PREFIX = "koul-agent";
export const AGENT_RULE_NAME = `${RULE_PREFIX}-${KOUL.router.slice(1, 7).toLowerCase()}`;
export const RATE_LIMIT = { calls: 40, windowLedgers: 2000 };
const writer = new KoulWriter(WRITE_CONFIG);

export interface AgentGrant {
  ruleId: number;
  name: string;
  policies: string[];
  /** Ledger sequence the rule stops working at, or null for never. */
  validUntil: number | null;
  /** Seconds left, or null for never. */
  secondsLeft: number | null;
  expired: boolean;
  /** Rule bound to the Koul policy (anything else would be unrestricted and is flagged). */
  restricted: boolean;
}

export function useAgentAccess() {
  const { kit, isConnected, address, txEpoch, config } = usePasskeyWallet();
  const p = usePoll<{ rules: ContextRule[]; ledger: number }>(
    isConnected && address && kit ? `agent:${address}` : null,
    async () => { const [rules, latest] = await Promise.all([kit!.rules.list(), kit!.rpc.getLatestLedger()]); return { rules, ledger: latest.sequence }; },
    { intervalMs: 60_000, enabled: isConnected && !!kit, deps: [txEpoch] },
  );
  const grants = useMemo<AgentGrant[]>(() => {
    if (!p.data) return [];
    return agentRulesOf(p.data.rules, config.ed25519VerifierAddress).map((r) => {
      const validUntil = r.valid_until ? Number(r.valid_until) : null;
      const left = validUntil === null ? null : Math.max(0, (validUntil - p.data!.ledger) * LEDGER_SECONDS);
      return { ruleId: Number(r.id), name: r.name, policies: r.policies.map(String), validUntil, secondsLeft: left, expired: left !== null && left <= 0, restricted: r.policies.map(String).includes(KOUL.policy) };
    });
  }, [p.data, config.ed25519VerifierAddress]);
  const active = grants.find((g) => !g.expired && g.restricted) ?? null;

  const action = usePasskeyAction();

  /** One passkey: add the agent rule for `days`, allowed exactly what `autopilot` needs on the user's own account. */
  const grant = useCallback(async (days: number, autopilot: CoreAutopilot) => {
    if (!kit) return null;
    const pub = Keypair.fromPublicKey(KOUL.agentPublicKey).rawPublicKey();
    return action.run(() => writer.buildGrantAgent(kit, autopilot, pub, days, AGENT_RULE_NAME, RATE_LIMIT.calls, RATE_LIMIT.windowLedgers), { title: "Autopilot key granted", description: `Valid for ${days} day${days === 1 ? "" : "s"}, restricted by the Koul policy.`, invalidatePrefixes: ["agent:"] });
  }, [kit, action]);

  const revoke = useCallback(async (ruleId: number) => {
    if (!kit) return null;
    return action.run(() => writer.buildRevokeAgent(kit, ruleId), { title: "Autopilot key revoked", description: "The keeper lost access immediately.", invalidatePrefixes: ["agent:"] });
  }, [kit, action]);

  return { grants, active, loading: isConnected && p.loading, error: p.error, refresh: p.refresh, grant, revoke, action };
}
