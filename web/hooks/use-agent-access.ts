"use client";

/**
 * Koul's access: the smart account context rule that carries the agent Ed25519 key bound to koul_agent_policy.
 * Grant (`rules.add` with the policy pinned to the user's XOXNO account and the calls the rules need), revoke
 * (`rules.remove`), extend (`rules.updateExpiration`). What the key may do is read back from the policy itself.
 */
import { useCallback, useMemo } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import type { ContextRule } from "smart-account-kit";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { KoulWriter, type Autopilot as CoreAutopilot } from "@koul/core";
import { KOUL, LEDGER_SECONDS, LEDGERS_PER_DAY, WRITE_CONFIG } from "@/lib/koul";
import { agentRulesOf, readAgentParams, type AgentParams } from "@/lib/data/live";
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
  const daysLeft = active ? (active.secondsLeft === null ? null : Math.max(0, Math.ceil(active.secondsLeft / 86400))) : null;
  const loaded = p.data !== undefined;

  const action = usePasskeyAction();

  /** One passkey: add the agent rule for `days`, allowed exactly what `autopilot` needs on the user's own account. */
  const grant = useCallback(async (days: number, autopilot: CoreAutopilot) => {
    if (!kit) return null;
    const pub = Keypair.fromPublicKey(KOUL.agentPublicKey).rawPublicKey();
    return action.run(() => writer.buildGrantAgent(kit, autopilot, pub, days, AGENT_RULE_NAME, RATE_LIMIT.calls, RATE_LIMIT.windowLedgers), { title: "Access given", description: `Koul's key works for ${days} day${days === 1 ? "" : "s"}.`, invalidatePrefixes: ["agent:", "params:"] });
  }, [kit, action]);

  const revoke = useCallback(async (ruleId: number) => {
    if (!kit) return null;
    return action.run(() => writer.buildRevokeAgent(kit, ruleId), { title: "Access revoked", description: "Koul's key stopped working immediately.", invalidatePrefixes: ["agent:", "params:"] });
  }, [kit, action]);

  /** One passkey: push the key's expiry `days` from now. */
  const extend = useCallback(async (ruleId: number, days: number) => {
    if (!kit) return null;
    return action.run(async () => {
      const latest = (await kit.rpc.getLatestLedger()).sequence;
      return kit.rules.updateExpiration(ruleId, latest + days * LEDGERS_PER_DAY);
    }, { title: "Access extended", description: `Koul's key now works for ${days} day${days === 1 ? "" : "s"}.`, invalidatePrefixes: ["agent:"] });
  }, [kit, action]);

  return { grants, active, daysLeft, loaded, loading: isConnected && p.loading, error: p.error, refresh: p.refresh, grant, revoke, extend, action };
}

/** What the installed policy actually allows, read from the policy contract for the active key. */
export function useAgentParams(ruleId: number | null): { params: AgentParams | null; loading: boolean; error: Error | null } {
  const { address, isConnected } = usePasskeyWallet();
  const p = usePoll<AgentParams | null>(isConnected && address && ruleId !== null ? `params:${address}:${ruleId}` : null, () => readAgentParams(address!, ruleId!), { intervalMs: 120_000, enabled: isConnected && ruleId !== null });
  return { params: p.data ?? null, loading: p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0)) && ruleId !== null, error: p.error };
}
