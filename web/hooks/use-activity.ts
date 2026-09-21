"use client";

/**
 * Everything that touched the wallet, newest first: the router's runs (AUTO) and the user's own moves (YOU), all
 * from contract events within the node's retention window, plus "Wallet created" when this browser did it.
 */
import { useMemo } from "react";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { usePoll } from "@/lib/data/store";
import { readWalletEvents, type WalletEvent } from "@/lib/data/events";
import { XOXNO } from "@/lib/koul";
import { walletCreatedAt } from "./use-wallet";

export type ActivityWho = "auto" | "you";
export type ActivityKind = "run" | "rules_saved" | "rules_cleared" | "access_given" | "supplied" | "withdrew" | "deposited" | "sent" | "wallet_created";

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  who: ActivityWho;
  at: number;
  title: string;
  /** USDC, signed from the wallet's point of view when money came in or left it. */
  amount?: number;
  signed?: boolean;
  txHash?: string;
  /** Which autopilot rule ran, for AUTO rows. */
  autopilotId?: number;
  ruleIndex?: number;
}

export interface ActivityState {
  rows: ActivityRow[];
  loading: boolean;
  error: Error | null;
  connected: boolean;
  /** False until the first read came back; rows may still hold "Wallet created" before that. */
  loaded: boolean;
  /** How far back the node still answers, in ms. */
  since: number | null;
  refresh: () => Promise<void>;
}

const usdc = (v: unknown) => Number(BigInt(String(v ?? 0))) / 1e7;
const hub = (h: unknown) => `Hub ${Number(h)}`;

function fromFired(e: WalletEvent): ActivityRow {
  const v = e.value;
  const kind = String(v.kind);
  const amount = usdc(v.amount);
  const base = { id: e.id, kind: "run" as const, who: "auto" as const, at: e.at, txHash: e.txHash, autopilotId: Number(v.autopilot_id), ruleIndex: Number(v.rule_index), amount };
  switch (kind) {
    case "move_supply": return { ...base, title: `Moved ${hub(v.from_hub)} to ${hub(v.to_hub)}` };
    case "supply": return { ...base, title: `Supplied to ${hub(v.to_hub)}` };
    case "withdraw": return { ...base, title: `Withdrew to wallet from ${hub(v.from_hub)}` };
    case "repay_wallet": return { ...base, title: `Repaid debt on ${hub(v.to_hub)}` };
    case "repay_collateral": return { ...base, title: `Repaid ${hub(v.to_hub)} from ${hub(v.from_hub)}` };
    default: return { ...base, title: kind };
  }
}

function fromTransfer(e: WalletEvent, wallet: string): ActivityRow | null {
  const amount = usdc(e.value.amount);
  const out = e.from === wallet;
  const other = out ? e.to : e.from;
  if (!other) return null;
  const base = { id: e.id, who: "you" as const, at: e.at, txHash: e.txHash, amount, signed: true };
  if (other === XOXNO.pool) return out ? { ...base, kind: "supplied", title: "Supplied to XOXNO", amount } : { ...base, kind: "withdrew", title: "Withdrew from XOXNO", amount };
  if (out) return { ...base, kind: "sent", title: `Sent to ${other.slice(0, 4)}…${other.slice(-4)}`, amount: -amount };
  return { ...base, kind: "deposited", title: "Deposited", amount };
}

export function toRows(events: WalletEvent[], wallet: string): ActivityRow[] {
  const autoTx = new Set(events.filter((e) => e.kind === "fired").map((e) => e.txHash));
  const rows: ActivityRow[] = [];
  for (const e of events) {
    switch (e.kind) {
      case "fired": rows.push(fromFired(e)); break;
      case "autopilot_set": rows.push({ id: e.id, kind: "rules_saved", who: "you", at: e.at, txHash: e.txHash, title: `Rules saved, ${Number(e.value.rules)} ${Number(e.value.rules) === 1 ? "rule" : "rules"}` }); break;
      case "autopilot_cleared": rows.push({ id: e.id, kind: "rules_cleared", who: "you", at: e.at, txHash: e.txHash, title: "Rules cleared" }); break;
      case "koul_installed": rows.push({ id: e.id, kind: "access_given", who: "you", at: e.at, txHash: e.txHash, title: "Access given" }); break;
      case "transfer": {
        // A transfer inside a router run is part of that run, not a move of the user's own.
        if (autoTx.has(e.txHash)) break;
        const row = fromTransfer(e, wallet);
        if (row) rows.push(row);
        break;
      }
    }
  }
  return rows;
}

export function useActivity(): ActivityState {
  const { isConnected, address, txEpoch } = usePasskeyWallet();
  const p = usePoll(isConnected && address ? `events:${address}` : null, () => readWalletEvents(address!), { intervalMs: 45_000, enabled: isConnected, deps: [txEpoch] });
  return useMemo(() => {
    if (!isConnected || !address) return { rows: [], loading: false, error: null, connected: false, loaded: false, since: null, refresh: p.refresh };
    const loading = p.data === undefined && (p.loading || (!p.error && p.updatedAt === 0));
    const rows = p.data ? toRows(p.data.events, address) : [];
    const created = walletCreatedAt(address);
    if (created) rows.push({ id: "wallet-created", kind: "wallet_created", who: "you", at: created, title: "Wallet created" });
    rows.sort((a, b) => b.at - a.at);
    const since = p.data ? p.updatedAt - (p.data.latestLedger - p.data.oldestLedger) * 5000 : null;
    return { rows, loading, error: p.error, connected: true, loaded: p.data !== undefined, since, refresh: p.refresh };
  }, [isConnected, address, p.data, p.loading, p.error, p.updatedAt, p.refresh]);
}
