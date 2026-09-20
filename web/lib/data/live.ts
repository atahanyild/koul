/**
 * Live readers against Stellar testnet. Every function throws on failure; the hooks decide whether to fall back
 * to the demo story. Reads simulate with the keeper's public G-account as source, which needs no signature.
 */
import { Address, BASE_FEE, Contract, TransactionBuilder, contract, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { ContextRule, SmartAccountKit } from "smart-account-kit";
import { KOUL, SIM_SOURCE, XOXNO, usdPerTryToTryPerUsd } from "@/lib/koul";
import { fromUnits } from "@/lib/format";
import { POOLS, type PoolId, type RouterRules } from "@/lib/model/autopilot";
import type { ActivityItem, FxPrice, Health, Pool, Positions } from "./types";

const clientOpts = { networkPassphrase: KOUL.networkPassphrase, rpcUrl: KOUL.rpcUrl, publicKey: SIM_SOURCE };
const clients = new Map<string, Promise<contract.Client>>();
function client(contractId: string): Promise<contract.Client> {
  let c = clients.get(contractId);
  if (!c) {
    c = contract.Client.from({ contractId, ...clientOpts });
    clients.set(contractId, c);
    c.catch(() => clients.delete(contractId));
  }
  return c;
}

type Assembled<T> = Promise<contract.AssembledTransaction<T>>;
type PoolClient = {
  get_deposit_rate: (a: { hub_asset: { asset: string; hub_id: number } }) => Assembled<bigint>;
  get_sync_data: (a: { hub_asset: { asset: string; hub_id: number } }) => Assembled<{ params: { max_utilization: bigint }; state: { cash: bigint; supplied: bigint; borrowed: bigint } }>;
  get_supplied_amount: (a: { hub_asset: { asset: string; hub_id: number } }) => Assembled<bigint>;
  get_borrowed_amount: (a: { hub_asset: { asset: string; hub_id: number } }) => Assembled<bigint>;
};
type ControllerClient = {
  get_health_factor: (a: { account_id: bigint }) => Assembled<bigint>;
  get_collateral_amount: (a: { account_id: bigint; hub_asset: { asset: string; hub_id: number } }) => Assembled<bigint>;
  get_borrow_amount: (a: { account_id: bigint; hub_asset: { asset: string; hub_id: number } }) => Assembled<bigint>;
};
type RouterClient = {
  get_rules: (a: { user: string }) => Assembled<RouterRules | undefined>;
  set_rules: (a: { user: string; rules: RouterRules }) => Assembled<null>;
};

const hubKey = (hub: number) => ({ asset: XOXNO.usdc, hub_id: hub });
const RAY = 1e27;
const WAD = 1e18;

/** Annual deposit and borrow rates and liquidity for both USDC hubs. */
export async function readPools(): Promise<Pool[]> {
  const pool = (await client(XOXNO.pool)) as unknown as PoolClient;
  const out: Pool[] = [];
  for (const id of ["A", "B"] as PoolId[]) {
    const p = POOLS[id];
    const k = hubKey(p.hub);
    const [rate, sync, supplied, borrowed] = await Promise.all([
      pool.get_deposit_rate({ hub_asset: k }).then((t) => t.result),
      pool.get_sync_data({ hub_asset: k }).then((t) => t.result),
      pool.get_supplied_amount({ hub_asset: k }).then((t) => t.result),
      pool.get_borrowed_amount({ hub_asset: k }).then((t) => t.result),
    ]);
    const suppliedN = fromUnits(supplied);
    const borrowedN = fromUnits(borrowed);
    const util = suppliedN > 0 ? borrowedN / suppliedN : 0;
    const supplyApy = Number(rate) / RAY * 100;
    // The pool exposes the deposit rate; the borrow rate is derived from utilisation and the reserve factor.
    const borrowApy = util > 0 ? supplyApy / util : 0;
    out.push({ ...p, supplyApy, borrowApy, utilization: util, availableUsdc: fromUnits(sync.state.cash), totalSuppliedUsdc: suppliedN });
  }
  return out;
}

/** The wallet's idle balances and its XOXNO position, when it has one. */
export async function readPositions(address: string, accountId: bigint | null, kit: SmartAccountKit | null): Promise<Positions & { health: Health }> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const balance = async (token: string): Promise<number> => {
    const acc = await server.getAccount(SIM_SOURCE);
    const { TransactionBuilder, BASE_FEE, Contract } = await import("@stellar/stellar-sdk");
    const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: KOUL.networkPassphrase })
      .addOperation(new Contract(token).call("balance", new Address(address).toScVal()))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("balance simulation failed");
    return fromUnits(BigInt(scValToNative(sim.result!.retval) as bigint));
  };
  void kit;
  const nativeSac = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // XLM SAC on testnet
  const [idleUsdc, idleXlm] = await Promise.all([balance(XOXNO.usdc), balance(nativeSac).catch(() => 0)]);
  const supplied: Record<PoolId, number> = { A: 0, B: 0 };
  const borrowed: Record<PoolId, number> = { A: 0, B: 0 };
  let health: Health = { factor: null, hasLoan: false, minimum: 1.25, liquidationAt: 1 };
  if (accountId !== null) {
    const ctrl = (await client(XOXNO.controller)) as unknown as ControllerClient;
    for (const id of ["A", "B"] as PoolId[]) {
      const k = hubKey(POOLS[id].hub);
      const [c, b] = await Promise.all([
        ctrl.get_collateral_amount({ account_id: accountId, hub_asset: k }).then((t) => t.result),
        ctrl.get_borrow_amount({ account_id: accountId, hub_asset: k }).then((t) => t.result),
      ]);
      supplied[id] = fromUnits(c);
      borrowed[id] = fromUnits(b);
    }
    const hf = await ctrl.get_health_factor({ account_id: accountId }).then((t) => t.result);
    const hasLoan = borrowed.A + borrowed.B > 0.000001;
    const factor = hf > 10n ** 30n || !hasLoan ? null : Number(hf) / WAD;
    health = { factor, hasLoan, minimum: 1.25, liquidationAt: 1 };
  }
  return { idleUsdc, idleXlm, supplied, borrowed, accountId: accountId === null ? null : accountId.toString(), health };
}

/** USD/TRY read directly from the mock oracle; the admin write route lives in oracle-admin. */
export async function readFx(): Promise<FxPrice> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const source = await server.getAccount(SIM_SOURCE);
  const asset = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol("TRY")]);
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: KOUL.networkPassphrase })
    .addOperation(new Contract(KOUL.oracle).call("lastprice", asset)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("oracle simulation failed");
  const reading = scValToNative(sim.result!.retval) as { price: bigint; timestamp: bigint } | null;
  if (!reading) throw new Error("no price");
  const timestamp = Number(reading.timestamp);
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
  return { tryPerUsd: usdPerTryToTryPerUsd(reading.price), timestamp, ageSec, stale: ageSec > 900, maxAgeSec: 900 };
}

export async function readRouterRules(address: string): Promise<RouterRules | null> {
  const router = (await client(KOUL.router)) as unknown as RouterClient;
  const r = await router.get_rules({ user: address });
  return r.result ?? null;
}

export async function buildSetRules(address: string, rules: RouterRules): Promise<contract.AssembledTransaction<null>> {
  const router = (await client(KOUL.router)) as unknown as RouterClient;
  return router.set_rules({ user: address, rules });
}

export interface Fired { ledger: number; tx: string; branch: string; amount: bigint; from_hub: number; to_hub: number; observed: bigint; observed_2: bigint; at: number }

/** Every branch the router executed for this wallet, from its `Fired` events, newest first. */
export async function readFired(address: string): Promise<Fired[]> {
  const server = new rpc.Server(KOUL.rpcUrl);
  const latest = (await server.getLatestLedger()).sequence;
  const res = await server.getEvents({
    startLedger: Math.max(1, latest - 17280 * 6),
    filters: [{ type: "contract", contractIds: [KOUL.router], topics: [[xdr.ScVal.scvSymbol("fired").toXDR("base64"), new Address(address).toScVal().toXDR("base64")]] }],
    limit: 100,
  });
  const now = Date.now();
  return res.events
    .map((e) => {
      const v = scValToNative(e.value) as Record<string, unknown>;
      const at = e.ledgerClosedAt ? Date.parse(e.ledgerClosedAt) : now - (latest - e.ledger) * 5000;
      return { ledger: e.ledger, tx: e.txHash, branch: String(v.branch), amount: BigInt(v.amount as bigint), from_hub: Number(v.from_hub), to_hub: Number(v.to_hub), observed: BigInt(v.observed as bigint), observed_2: BigInt(v.observed_2 as bigint), at };
    })
    .reverse();
}

const pct = (ray: bigint) => (Number(ray) / RAY * 100).toFixed(2);

export function firedToActivity(f: Fired): ActivityItem {
  const usdc = fromUnits(f.amount);
  const amt = usdc.toFixed(2);
  const pool = (h: number) => (h === 2 ? "Pool B" : "Pool A");
  if (f.branch === "rebalance") {
    return { id: f.tx, kind: "autopilot_run", at: f.at, title: `Moved ${amt} USDC to ${pool(f.to_hub)}`, detail: `${pool(f.to_hub)} paid ${pct(f.observed_2)}% against ${pool(f.from_hub)}'s ${pct(f.observed)}%.`, txHash: f.tx, autopilotName: "Lira shield", ruleName: "Best rate" };
  }
  if (f.branch === "health") {
    const before = (Number(f.observed) / WAD).toFixed(2);
    const after = f.observed_2 > 10n ** 30n ? "no loan" : (Number(f.observed_2) / WAD).toFixed(2);
    return { id: f.tx, kind: "autopilot_run", at: f.at, title: `Repaid ${amt} USDC from the wallet`, detail: `Loan health was ${before}, under your minimum. Now ${after}.`, txHash: f.tx, autopilotName: "Lira shield", ruleName: "Stay safe" };
  }
  if (f.branch === "fx_exit") {
    const now = (1e14 / Number(f.observed)).toFixed(2);
    const level = (1e14 / Number(f.observed_2)).toFixed(2);
    return { id: f.tx, kind: "autopilot_run", at: f.at, title: `Withdrew ${amt} USDC to the wallet`, detail: `USD/TRY reached ${now}, past your ${level} level.`, txHash: f.tx, autopilotName: "Lira shield", ruleName: "Lira exit" };
  }
  return { id: f.tx, kind: "autopilot_run", at: f.at, title: `${f.branch}: ${amt} USDC`, detail: "", txHash: f.tx };
}

/** Agent rules on the smart account: the rule that carries the keeper's Ed25519 key. */
export function agentRulesOf(rules: ContextRule[], ed25519Verifier: string | undefined): ContextRule[] {
  return rules.filter((r) => r.signers.some((s) => s.tag === "External" && ed25519Verifier === s.values[0]));
}
