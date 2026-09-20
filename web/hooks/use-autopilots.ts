"use client";

/**
 * Autopilots = local drafts (this browser) + the ones the router holds for this wallet. A chain autopilot's rules
 * come from `get_autopilot` through `fromCoreAutopilot`; arming writes through `toCoreAutopilot` and `set_autopilot`.
 * Names and sentences are not stored on-chain, so a local record keyed by the chain id keeps them.
 */
import { useCallback, useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { KoulReader, KoulWriter, validateAutopilot, type Autopilot as CoreAutopilot } from "@koul/core";
import { createLocalStore } from "@/lib/data/store";
import type { ChainAutopilot } from "@/lib/data/live";
import { READ_CONFIG, WRITE_CONFIG } from "@/lib/koul";
import { fmtUsdc } from "@/lib/format";
import { fromCoreAutopilot, newId, toCoreAutopilot, type Autopilot, type Rule } from "@/lib/model/autopilot";
import { useAgentAccess } from "./use-agent-access";
import { useChainAutopilots } from "./use-portfolio";
import { usePasskeyAction } from "./use-passkey-action";

const drafts = createLocalStore<Autopilot[]>("koul.autopilots", []);
const writer = new KoulWriter(WRITE_CONFIG);
const reader = new KoulReader(READ_CONFIG);
export const CHAIN_PREFIX = "chain-";
export const chainUiId = (id: number) => `${CHAIN_PREFIX}${id}`;
export const chainIdOf = (uiId: string): number | null => (uiId.startsWith(CHAIN_PREFIX) ? Number(uiId.slice(CHAIN_PREFIX.length)) : null);

export interface AutopilotsState {
  autopilots: Autopilot[];
  loading: boolean;
  error: Error | null;
  connected: boolean;
}

function chainAutopilot(c: ChainAutopilot, agent: ReturnType<typeof useAgentAccess>["active"], local: Autopilot | undefined): Autopilot {
  const rules = fromCoreAutopilot(c.autopilot).map((r) => ({ ...r, inferred: local?.rules.find((l) => l.id === r.id)?.inferred ?? r.inferred }));
  return {
    id: chainUiId(c.id),
    name: local?.name ?? (rules.length === 3 ? "Lira shield" : rules.length === 1 ? rules[0]!.name : `Autopilot ${c.id}`),
    description: local?.description ?? "",
    rules,
    status: agent ? "armed" : "paused",
    createdAt: local?.createdAt ?? Date.now(),
    armedUntil: agent && agent.secondsLeft !== null ? Date.now() + agent.secondsLeft * 1000 : null,
    agentRuleId: agent?.ruleId ?? null,
    runs: local?.runs ?? 0,
    lastRunAt: local?.lastRunAt ?? null,
  };
}

export function useAutopilots(): AutopilotsState {
  const { isConnected } = usePasskeyWallet();
  const [local] = drafts.use();
  const chain = useChainAutopilots();
  const agent = useAgentAccess();

  return useMemo(() => {
    const localOnly = local.filter((a) => chainIdOf(a.id) === null);
    if (!isConnected) return { autopilots: localOnly, loading: false, error: null, connected: false };
    if (chain.loading) return { autopilots: [], loading: true, error: null, connected: true };
    const onChain = chain.list.map((c) => chainAutopilot(c, agent.active, local.find((a) => a.id === chainUiId(c.id))));
    return { autopilots: [...onChain, ...localOnly], loading: false, error: chain.error, connected: true };
  }, [isConnected, local, chain.loading, chain.list, chain.error, agent.active]);
}

export function useAutopilot(id: string): { autopilot: Autopilot | null; loading: boolean } {
  const s = useAutopilots();
  const ap = s.autopilots.find((a) => a.id === id) ?? null;
  return { autopilot: ap, loading: s.loading };
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
   * Patch an autopilot. Unknown ids are seeded from `seed` (pass the autopilot you are showing, e.g. the on-chain
   * one), so editing any autopilot creates a local record that carries its name and marks.
   */
  const update = useCallback((id: string, patch: Partial<Autopilot> | ((a: Autopilot) => Autopilot), seed?: Autopilot) => {
    setLocal((prev) => {
      const exists = prev.some((a) => a.id === id);
      const list = exists ? prev : seed && seed.id === id ? [seed, ...prev] : prev;
      return list.map((a) => (a.id === id ? (typeof patch === "function" ? patch(a) : { ...a, ...patch }) : a));
    });
  }, [setLocal]);
  const remove = useCallback((id: string) => setLocal((prev) => prev.filter((a) => a.id !== id)), [setLocal]);
  return { create, update, remove };
}

export type ArmResult =
  | { ok: true; chainId: number; grantHash: string | null; rulesHash: string; openHash?: string | null }
  | { ok: false; step: "wallet" | "account" | "open" | "rules" | "grant" | "write"; grantHash?: string | null; errors?: string[] };

/** XOXNO mints the position inside the first supply, and the id shows up on the position NFT a ledger later. */
async function waitForAccountId(address: string, attempts = 12): Promise<bigint | null> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 2500));
    try {
      const nft = await reader.readPositionNft(address);
      if (nft) return BigInt(nft.tokenId);
    } catch { /* keep waiting */ }
  }
  return null;
}

/**
 * Arming = up to two passkey confirmations: grant the agent key (if not already active), then `set_autopilot` on
 * the router. `preview` returns the mapping so the sheet can list unsupported rules before the first prompt.
 */
export function useArmAutopilot() {
  const { kit, address } = usePasskeyWallet();
  const agent = useAgentAccess();
  const chain = useChainAutopilots();
  const write = usePasskeyAction();
  const openAction = usePasskeyAction();

  const preview = useCallback((ap: Autopilot, accountId: bigint) => {
    const m = toCoreAutopilot(ap, accountId);
    return { ...m, errors: m.autopilot.rules.length ? validateAutopilot(m.autopilot) : ["No rule the router can run"] };
  }, []);

  /**
   * Arming a wallet that has never supplied opens the position first: one passkey-signed supply with account id 0,
   * which XOXNO turns into a position, then the id comes back from the position NFT. `openWith` says how much and
   * where; without it a wallet with no position cannot be armed.
   */
  const arm = useCallback(async (ap: Autopilot, opts: { days: number; accountId: bigint | null; openWith?: { hub: number; units: bigint } }): Promise<ArmResult> => {
    if (!kit || !address) return { ok: false, step: "wallet" };
    let accountId = opts.accountId;
    let openHash: string | null = null;
    if (accountId === null) {
      if (!opts.openWith || opts.openWith.units <= 0n) return { ok: false, step: "account" };
      const opened = await openAction.run(() => writer.buildSupply(address, 0n, opts.openWith!.hub, opts.openWith!.units), {
        title: `Position opened with ${fmtUsdc(Number(opts.openWith.units) / 1e7)} USDC`,
        description: "XOXNO minted your position; Koul reads its id from the position NFT.",
        invalidatePrefixes: ["portfolio:", "pools"],
      });
      if (!opened) return { ok: false, step: "open" };
      openHash = opened.hash;
      accountId = await waitForAccountId(address);
      if (accountId === null) return { ok: false, step: "open", grantHash: null };
    }
    const m = preview(ap, accountId);
    if (m.errors.length) return { ok: false, step: "rules", errors: m.errors };
    const core: CoreAutopilot = { ...m.autopilot, account_id: accountId.toString() };
    let grantHash: string | null = null;
    if (!agent.active) {
      const g = await agent.grant(opts.days, core);
      if (!g) return { ok: false, step: "grant" };
      grantHash = g.hash;
    }
    const existing = chainIdOf(ap.id);
    const chainId = existing ?? (chain.list.length ? Math.max(...chain.list.map((c) => c.id)) + 1 : 1);
    const res = await write.run(() => writer.buildSetAutopilot(address, chainId, core), { title: "Rules saved on-chain", description: `${core.rules.length} router rule${core.rules.length === 1 ? "" : "s"} for ${ap.name}.`, invalidatePrefixes: ["autopilots:", "portfolio:"] });
    if (!res) return { ok: false, step: "write", grantHash };
    // The chain now holds the rules: keep name, sentence and marks under the chain id, drop the draft it came from.
    const armed: Autopilot = { ...ap, id: chainUiId(chainId), status: "armed", armedUntil: Date.now() + opts.days * 86400_000, agentRuleId: agent.active?.ruleId ?? null };
    drafts.set((prev) => [armed, ...prev.filter((a) => a.id !== ap.id && a.id !== armed.id)]);
    return { ok: true, chainId, grantHash, rulesHash: res.hash, openHash };
  }, [kit, address, agent, chain.list, preview, write, openAction]);

  /** Revoke the agent key: every autopilot stops, the rules stay stored. */
  const pause = useCallback(async () => {
    if (!agent.active) return null;
    return agent.revoke(agent.active.ruleId);
  }, [agent]);

  /** Remove an autopilot from the router (one passkey). */
  const clear = useCallback(async (uiId: string) => {
    const chainId = chainIdOf(uiId);
    if (!address || chainId === null) return null;
    const res = await write.run(() => writer.buildClearAutopilot(address, chainId), { title: "Autopilot removed", description: "The router no longer holds these rules.", invalidatePrefixes: ["autopilots:"] });
    if (res) drafts.set((prev) => prev.filter((a) => a.id !== uiId));
    return res;
  }, [address, write]);

  return { arm, pause, clear, preview, agent, grantAction: agent.action, rulesAction: write, openAction, chain };
}
