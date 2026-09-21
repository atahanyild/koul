/**
 * Everything that touched the wallet, read from contract events within the RPC's retention window (about seven
 * days on testnet). Six topic filters across three contracts, walked in 5000-ledger windows from the newest ledger
 * back, because the node answers a wider range with an empty list instead of an error.
 *
 *   router   fired { autopilot_id, rule_index, kind, amount, from_hub, to_hub, observed[] }   -> AUTO
 *   router   autopilot_set { autopilot_id, account_id, rules } / autopilot_cleared            -> YOU
 *   policy   koul_installed { context_rule_id, allowed_calls, max_calls_per_window, ... }     -> YOU
 *   usdc     transfer(from, to, asset) amount, wallet on either side                          -> YOU
 */
import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { KOUL, XOXNO } from "@/lib/koul";

export type WalletEventKind = "fired" | "autopilot_set" | "autopilot_cleared" | "koul_installed" | "transfer";

export interface WalletEvent {
  id: string;
  kind: WalletEventKind;
  ledger: number;
  /** Unix ms from the ledger close time the node reports. */
  at: number;
  txHash: string;
  /** Decoded event value, shape by kind. */
  value: Record<string, unknown>;
  /** For transfers: the two parties. */
  from?: string;
  to?: string;
}

const WINDOW = 5000;
const PAGE = 200;
const server = new rpc.Server(KOUL.rpcUrl);
const sym = (s: string) => xdr.ScVal.scvSymbol(s).toXDR("base64");

function decodeValue(v: xdr.ScVal): Record<string, unknown> {
  const native = scValToNative(v) as unknown;
  if (native && typeof native === "object" && !Array.isArray(native)) return native as Record<string, unknown>;
  return { amount: native };
}

async function page(filters: rpc.Api.EventFilter[], startLedger: number, endLedger: number, out: WalletEvent[]) {
  let cursor: string | undefined;
  do {
    const request = cursor ? { cursor, limit: PAGE, filters } : { startLedger, endLedger, limit: PAGE, filters };
    let res: rpc.Api.GetEventsResponse;
    try {
      res = await server.getEvents(request);
    } catch (err) {
      const m = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
      throw new Error(m);
    }
    for (const e of res.events) {
      if (e.ledger > endLedger) break;
      const topics = e.topic.map((t) => { try { return scValToNative(t) as unknown; } catch { return null; } });
      const name = String(topics[0] ?? "");
      const kind: WalletEventKind | null = name === "fired" || name === "autopilot_set" || name === "autopilot_cleared" || name === "koul_installed" || name === "transfer" ? name : null;
      if (!kind) continue;
      const value = decodeValue(e.value);
      // Router v1 emitted `fired { branch }`; those are not autopilot runs.
      if (kind === "fired" && typeof value.kind !== "string") continue;
      const at = e.ledgerClosedAt ? Date.parse(e.ledgerClosedAt) : 0;
      const row: WalletEvent = { id: e.id, kind, ledger: e.ledger, at, txHash: e.txHash, value };
      if (kind === "transfer") { row.from = String(topics[1] ?? ""); row.to = String(topics[2] ?? ""); }
      out.push(row);
    }
    cursor = res.events.length === PAGE && res.events[res.events.length - 1]!.ledger <= endLedger ? res.cursor : undefined;
  } while (cursor);
}

/**
 * Newest first. Stops after `limit` rows or at the oldest ledger the node still has. Two requests per window:
 * the RPC takes at most five filters, and there are six.
 */
export async function readWalletEvents(address: string, limit = 80): Promise<{ events: WalletEvent[]; oldestLedger: number; latestLedger: number }> {
  const health = await server.getHealth();
  const latest = health.latestLedger;
  const oldest = Math.max(1, (health.oldestLedger ?? 1) + 1);
  const wallet = new Address(address).toScVal().toXDR("base64");
  const routerAndPolicy: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [KOUL.router], topics: [[sym("fired"), wallet], [sym("autopilot_set"), wallet], [sym("autopilot_cleared"), wallet]] },
    { type: "contract", contractIds: [KOUL.policy], topics: [[sym("koul_installed"), wallet]] },
  ];
  const transfers: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: [XOXNO.usdc], topics: [[sym("transfer"), wallet, "*", "*"], [sym("transfer"), "*", wallet, "*"]] },
  ];
  const out: WalletEvent[] = [];
  for (let end = latest; end >= oldest && out.length < limit; end -= WINDOW) {
    const start = Math.max(oldest, end - WINDOW + 1);
    const chunk: WalletEvent[] = [];
    await Promise.all([page(routerAndPolicy, start, end, chunk), page(transfers, start, end, chunk)]);
    out.push(...chunk);
  }
  // Ledger order, then a stable tiebreak so a transfer and its `fired` event keep a fixed order.
  out.sort((a, b) => b.ledger - a.ledger || b.id.localeCompare(a.id));
  return { events: out.slice(0, limit), oldestLedger: oldest, latestLedger: latest };
}
