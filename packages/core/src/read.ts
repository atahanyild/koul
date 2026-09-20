import { Address, BASE_FEE, Contract, TransactionBuilder, contract, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Executed, RuleState } from "./schema.js";

export interface KoulConfig {
  rpcUrl: string;
  networkPassphrase: string;
  publicKey: string; // G-account used only as the simulation source
  router: string;
  oracle: string;
  controller: string;
  pool: string;
  usdc: string;
  xlm: string;
  hubs?: number[];
}
export interface HubPosition {
  hub: number;
  collateral: bigint;
  debt: bigint;
  depositRate: bigint; // annual rate, RAY units
  cash: bigint;
  supplied: bigint;
  borrowed: bigint;
  utilisation: bigint; // RAY units
  maxUtilisation: bigint;
}
export interface Portfolio {
  address: string;
  accountId?: bigint;
  idleUsdc: bigint;
  xlm: bigint;
  healthFactor?: bigint; // WAD units; absent when no XOXNO account is known
  hubs: HubPosition[];
}
export interface OracleReading { asset: string; price: bigint; timestamp: bigint; decimals: number; ageSeconds: number }
export interface FiredEvent { ledger: number; txHash: string; user: string; autopilot_id: number; rule_index: number; kind: string; amount: bigint; from_hub: number; to_hub: number; observed: bigint[] }

type Call = (args: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
type Router = { list_ids: Call; get_autopilot: Call; check: Call; tick: Call };
type Controller = { get_health_factor: Call; get_collateral_amount: Call; get_borrow_amount: Call };
type Pool = { get_deposit_rate: Call; get_sync_data: Call; get_supplied_amount: Call; get_borrowed_amount: Call; get_utilisation: Call };

export class KoulReader {
  private readonly server: rpc.Server;
  constructor(readonly config: KoulConfig) { this.server = new rpc.Server(config.rpcUrl); }
  private options() { return { rpcUrl: this.config.rpcUrl, networkPassphrase: this.config.networkPassphrase, publicKey: this.config.publicKey }; }
  private async client<T>(id: string): Promise<T> { return await contract.Client.from({ contractId: id, ...this.options() }) as T; }
  private async raw(contractId: string, method: string, args: xdr.ScVal[]): Promise<unknown> {
    const account = await this.server.getAccount(this.config.publicKey);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.config.networkPassphrase })
      .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`${method} simulation failed: ${"error" in sim ? String(sim.error) : "no result"}`);
    return scValToNative(sim.result!.retval);
  }
  private key(hub: number) { return { asset: this.config.usdc, hub_id: hub }; }

  async readPortfolio(address: string, accountId?: bigint): Promise<Portfolio> {
    if (accountId === undefined) {
      const router = await this.client<Router>(this.config.router);
      const ids = (await router.list_ids({ user: address })).result as number[];
      if (ids.length) {
        const ap = (await router.get_autopilot({ user: address, id: ids[0] })).result as { account_id: bigint } | undefined;
        accountId = ap?.account_id;
      }
    }
    const [idleUsdc, xlm] = await Promise.all([
      this.raw(this.config.usdc, "balance", [new Address(address).toScVal()]) as Promise<bigint>,
      this.raw(this.config.xlm, "balance", [new Address(address).toScVal()]) as Promise<bigint>,
    ]);
    if (accountId === undefined) return { address, idleUsdc, xlm, hubs: [] };
    const controller = await this.client<Controller>(this.config.controller);
    const pool = await this.client<Pool>(this.config.pool);
    const healthFactor = (await controller.get_health_factor({ account_id: accountId })).result as bigint;
    const hubs = await Promise.all((this.config.hubs ?? [1, 2]).map(async (hub): Promise<HubPosition> => {
      const hub_asset = this.key(hub);
      const [collateral, debt, depositRate, sync, supplied, borrowed, utilisation] = await Promise.all([
        controller.get_collateral_amount({ account_id: accountId, hub_asset }).then((v) => v.result as bigint),
        controller.get_borrow_amount({ account_id: accountId, hub_asset }).then((v) => v.result as bigint),
        pool.get_deposit_rate({ hub_asset }).then((v) => v.result as bigint),
        pool.get_sync_data({ hub_asset }).then((v) => v.result as { state: { cash: bigint }; params: { max_utilization: bigint } }),
        pool.get_supplied_amount({ hub_asset }).then((v) => v.result as bigint),
        pool.get_borrowed_amount({ hub_asset }).then((v) => v.result as bigint),
        pool.get_utilisation({ hub_asset }).then((v) => v.result as bigint),
      ]);
      return { hub, collateral, debt, depositRate, cash: sync.state.cash, supplied, borrowed, utilisation, maxUtilisation: sync.params.max_utilization };
    }));
    return { address, accountId, idleUsdc, xlm, healthFactor, hubs };
  }

  async readOracle(asset = "TRY"): Promise<OracleReading | null> {
    const oracleAsset = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(asset)]);
    const [price, decimals] = await Promise.all([
      this.raw(this.config.oracle, "lastprice", [oracleAsset]) as Promise<{ price: bigint; timestamp: bigint } | null>,
      this.raw(this.config.oracle, "decimals", []) as Promise<number>,
    ]);
    if (!price) return null;
    return { asset, price: price.price, timestamp: price.timestamp, decimals, ageSeconds: Math.max(0, Math.floor(Date.now() / 1000) - Number(price.timestamp)) };
  }

  async simulateTick(user: string, id: number): Promise<Executed | null> {
    const router = await this.client<Router>(this.config.router);
    return ((await router.tick({ user, id })).result as Executed | undefined) ?? null;
  }

  async checkAutopilot(user: string, id: number): Promise<RuleState[]> {
    const router = await this.client<Router>(this.config.router);
    return (await router.check({ user, id })).result as RuleState[];
  }

  async readFired(user: string, startLedger: number, limit = 100): Promise<FiredEvent[]> {
    const res = await this.server.getEvents({ startLedger, limit, filters: [{ type: "contract", contractIds: [this.config.router], topics: [[xdr.ScVal.scvSymbol("fired").toXDR("base64"), new Address(user).toScVal().toXDR("base64")]] }] });
    return res.events.map((event) => ({
      ledger: event.ledger, txHash: event.txHash, user,
      ...(scValToNative(event.value) as Omit<FiredEvent, "ledger" | "txHash" | "user">),
    }));
  }
}
