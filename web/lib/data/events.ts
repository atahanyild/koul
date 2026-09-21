/**
 * Everything that touched the wallet, read from contract events within the RPC's retention window (about seven
 * days on testnet). Six topic filters across three contracts, walked in 5000-ledger windows from the newest ledger
 * back, because the node answers a wider range with an empty list instead of an error. A window that has closed
 * never changes, so its rows are kept in memory and only the newest window is asked again on each poll.
 *
 *   router   fired { autopilot_id, rule_index, kind, amount, from_hub, to_hub, observed[] }   -> AUTO
 *   router   autopilot_set { autopilot_id, account_id, rules } / autopilot_cleared            -> YOU
 *   policy   koul_installed { context_rule_id, allowed_calls, max_calls_per_window, ... }     -> YOU
 *   wallet   context_rule_removed(rule_id) from the smart account itself, when it is Koul's rule -> YOU
 *   usdc     transfer(from, to, asset) amount, wallet on either side                          -> YOU
 */
import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { KOUL, XOXNO } from "@/lib/koul";

export type WalletEventKind = "fired" | "autopilot_set" | "autopilot_cleared" | "koul_installed" | "context_rule_removed" | "transfer";

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

/** How many windows are asked for at once. The node answers each in about half a second; six keeps a week under 3 s. */
const PARALLEL = 6;
/** Local storage keys: one per closed window, one for the last full answer (shown until the next read lands). */
const windowKey = (address: string, start: number) => `koul.events.w1:${address}:${start}`;
const snapshotKey = (address: string) => `koul.events.s1:${address}`;
/** i128 amounts come out of the decoder as bigint; stored as decimal strings, which every reader already accepts. */
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

/** Rows of windows that have fully closed, keyed by wallet and window start. Never invalidated: the past is fixed. */
const closed = new Map<string, WalletEvent[]>();
function loadClosed(address: string, start: number): WalletEvent[] | undefined {
  const key = windowKey(address, start);
  const inMemory = closed.get(key);
  if (inMemory) return inMemory;
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    if (!raw) return undefined;
    const rows = JSON.parse(raw) as WalletEvent[];
    closed.set(key, rows);
    return rows;
  } catch {
    return undefined;
  }
}
function saveClosed(address: string, start: number, rows: WalletEvent[]) {
  const key = windowKey(address, start);
  closed.set(key, rows);
  try { window.localStorage.setItem(key, json(rows)); } catch { /* full or unavailable: memory still has it */ }
}

export interface WalletEvents { events: WalletEvent[]; oldestLedger: number; latestLedger: number }

/** The last full answer for this wallet, for the first paint after a reload. Windows older than the node keeps are dropped. */
export function loadEventsSnapshot(address: string): WalletEvents | undefined {
  try {
    const raw = window.localStorage.getItem(snapshotKey(address));
    return raw ? (JSON.parse(raw) as WalletEvents) : undefined;
  } catch {
    return undefined;
  }
}
function saveSnapshot(address: string, value: WalletEvents) {
  try {
    window.localStorage.setItem(snapshotKey(address), json(value));
    // Windows the node no longer answers for are dead weight.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (!k?.startsWith(`koul.events.w1:${address}:`)) continue;
      if (Number(k.slice(k.lastIndexOf(":") + 1)) + WINDOW <= value.oldestLedger) window.localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}

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
      const kind: WalletEventKind | null = name === "fired" || name === "autopilot_set" || name === "autopilot_cleared" || name === "koul_installed" || name === "context_rule_removed" || name === "transfer" ? name : null;
      if (!kind) continue;
      // The smart account puts the removed rule's id in the second topic and nothing in the value.
      const value = kind === "context_rule_removed" ? { rule: Number(topics[1]) } : decodeValue(e.value);
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

/** One window, both requests: the RPC takes at most five filters per call and there are seven. */
async function readWindow(filters: [rpc.Api.EventFilter[], rpc.Api.EventFilter[]], start: number, end: number): Promise<WalletEvent[]> {
  const chunk: WalletEvent[] = [];
  await page(filters[0], start, end, chunk);
  await page(filters[1], start, end, chunk);
  return chunk;
}

/**
 * Newest first. Walks the windows a few at a time, newest first, and stops once `limit` rows are in hand or the
 * node's oldest ledger is reached. Closed windows come from memory or local storage; only open ones hit the node.
 */
export async function readWalletEvents(address: string, limit = 80): Promise<WalletEvents> {
  const health = await server.getHealth();
  const latest = health.latestLedger;
  const oldest = Math.max(1, (health.oldestLedger ?? 1) + 1);
  const wallet = new Address(address).toScVal().toXDR("base64");
  const filters: [rpc.Api.EventFilter[], rpc.Api.EventFilter[]] = [
    [
      { type: "contract", contractIds: [KOUL.router], topics: [[sym("fired"), wallet], [sym("autopilot_set"), wallet], [sym("autopilot_cleared"), wallet]] },
      { type: "contract", contractIds: [KOUL.policy], topics: [[sym("koul_installed"), wallet]] },
      { type: "contract", contractIds: [address], topics: [[sym("context_rule_removed"), "*"]] },
    ],
    [{ type: "contract", contractIds: [XOXNO.usdc], topics: [[sym("transfer"), wallet, "*", "*"], [sym("transfer"), "*", wallet, "*"]] }],
  ];
  // Windows are aligned to fixed boundaries so a closed window's key stays the same on every call.
  const starts: number[] = [];
  for (let start = Math.floor(latest / WINDOW) * WINDOW; start + WINDOW > oldest; start -= WINDOW) starts.push(start);
  const out: WalletEvent[] = [];
  let stop = false;
  for (let i = 0; i < starts.length && !stop && out.length < limit; i += PARALLEL) {
    const batch = starts.slice(i, i + PARALLEL);
    const results = await Promise.all(batch.map(async (start): Promise<WalletEvent[] | null> => {
      let from = Math.max(oldest, start);
      const to = Math.min(latest, start + WINDOW - 1);
      const done = loadClosed(address, start);
      if (done) return done;
      if (from === oldest) {
        // The node forgets one ledger every five seconds; ask again where its memory starts now, keep a minute
        // clear of the edge, and let the edge window go if it still slipped.
        const fresh = await server.getHealth();
        from = Math.max(from, (fresh.oldestLedger ?? 1) + 1 + EDGE);
        if (from > to) return null;
      }
      let rows: WalletEvent[];
      try {
        rows = await readWindow(filters, from, to);
      } catch (err) {
        if (from > start && /ledger range/i.test(String(err))) return null;
        throw err;
      }
      // Closed for good once the newest ledger has moved past it and the node still had its first ledger.
      if (to < latest && from === start) saveClosed(address, start, rows);
      return rows;
    }));
    for (const rows of results) {
      if (rows === null) { stop = true; break; }
      out.push(...rows);
    }
  }
  out.sort((a, b) => b.ledger - a.ledger || b.id.localeCompare(a.id));
  const value = { events: out.slice(0, limit), oldestLedger: oldest, latestLedger: latest };
  if (typeof window !== "undefined") saveSnapshot(address, value);
  return value;
}
