/**
 * Everything that touched the wallet, read from contract events within the RPC's retention window (about seven
 * days on testnet). Six topic filters across three contracts, walked in 5000-ledger windows from the newest ledger
 * back, because the node answers a wider range with an empty list instead of an error. A window that has closed
 * never changes, so its rows are kept in memory and only the newest window is asked again on each poll.
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
/** Ledgers kept clear of the node's oldest one, about a minute, so the two requests of the edge window both land inside it. */
const EDGE = 12;
const server = new rpc.Server(KOUL.rpcUrl);
const sym = (s: string) => xdr.ScVal.scvSymbol(s).toXDR("base64");

/** Rows of windows that have fully closed, keyed by wallet and window start. Never invalidated: the past is fixed. */
const closed = new Map<string, WalletEvent[]>();

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

/** One window, both requests: the RPC takes at most five filters per call and there are six. */
async function readWindow(filters: [rpc.Api.EventFilter[], rpc.Api.EventFilter[]], start: number, end: number): Promise<WalletEvent[]> {
  const chunk: WalletEvent[] = [];
  await page(filters[0], start, end, chunk);
  await page(filters[1], start, end, chunk);
  return chunk;
}

/** Newest first. Stops after `limit` rows or at the oldest ledger the node still has. */
export async function readWalletEvents(address: string, limit = 80): Promise<{ events: WalletEvent[]; oldestLedger: number; latestLedger: number }> {
  const health = await server.getHealth();
  const latest = health.latestLedger;
  const oldest = Math.max(1, (health.oldestLedger ?? 1) + 1);
  const wallet = new Address(address).toScVal().toXDR("base64");
  const filters: [rpc.Api.EventFilter[], rpc.Api.EventFilter[]] = [
    [
      { type: "contract", contractIds: [KOUL.router], topics: [[sym("fired"), wallet], [sym("autopilot_set"), wallet], [sym("autopilot_cleared"), wallet]] },
      { type: "contract", contractIds: [KOUL.policy], topics: [[sym("koul_installed"), wallet]] },
    ],
    [{ type: "contract", contractIds: [XOXNO.usdc], topics: [[sym("transfer"), wallet, "*", "*"], [sym("transfer"), "*", wallet, "*"]] }],
  ];
  // Windows are aligned to fixed boundaries so a closed window's key stays the same on every call.
  const out: WalletEvent[] = [];
  for (let start = Math.floor(latest / WINDOW) * WINDOW; start + WINDOW > oldest && out.length < limit; start -= WINDOW) {
    let from = Math.max(oldest, start);
    const to = Math.min(latest, start + WINDOW - 1);
    const key = `${address}:${start}`;
    const done = closed.get(key);
    if (done) { out.push(...done); continue; }
    if (from === oldest) {
      // The node forgets one ledger every five seconds; the walk to here took longer than that. Ask again where
      // its memory starts now, keep a minute clear of the edge, and let the edge window go if it still slipped.
      const fresh = await server.getHealth();
      from = Math.max(from, (fresh.oldestLedger ?? 1) + 1 + EDGE);
      if (from > to) break;
    }
    let rows: WalletEvent[];
    try {
      rows = await readWindow(filters, from, to);
    } catch (err) {
      if (from > start && /ledger range/i.test(String(err))) break;
      throw err;
    }
    // Closed for good once the newest ledger has moved past it and the node still had its first ledger.
    if (to < latest && from === start) closed.set(key, rows);
    out.push(...rows);
  }
  out.sort((a, b) => b.ledger - a.ledger || b.id.localeCompare(a.id));
  return { events: out.slice(0, limit), oldestLedger: oldest, latestLedger: latest };
}
