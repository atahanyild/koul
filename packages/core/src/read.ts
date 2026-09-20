import { Address, BASE_FEE, Contract, TransactionBuilder, contract, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import type { Autopilot, Executed, RuleState } from "./schema";
import { decodeAutopilot } from "./codec";

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
  /** XOXNO position NFT ("XOXNO Lending Position", XLEND). The token id is the XOXNO account id. */
  positionNft?: string;
}
export interface PositionNft { contract: string; tokenId: number; name: string; symbol: string; imageUrl: string }
export const XOXNO_POSITION_NFT = "CDVN5JU675MEDPVRPCYC45AHFC275UH57WEU5OTFE4WFGZBNN7HTLPSY";
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

const EVENT_WINDOW = 5000;
const EVENT_PAGE = 200;
type Call = (args: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
type Router = { list_ids: Call; get_autopilot: Call; check: Call; tick: Call; list_users: Call };
type Controller = { get_health_factor: Call; get_collateral_amount: Call; get_borrow_amount: Call };
type Pool = { get_deposit_rate: Call; get_sync_data: Call; get_supplied_amount: Call; get_borrowed_amount: Call; get_utilisation: Call };

export class KoulReader {
  private readonly server: rpc.Server;
  constructor(readonly config: KoulConfig) { this.server = new rpc.Server(config.rpcUrl); }
  private options() { return { rpcUrl: this.config.rpcUrl, networkPassphrase: this.config.networkPassphrase, publicKey: this.config.publicKey }; }
  private async client<T>(id: string): Promise<T> { return await contract.Client.from({ contractId: id, ...this.options() }) as T; }
  private async raw(contractId: string, method: string, args: xdr.ScVal[], keepScVal = false): Promise<unknown> {
    const account = await this.server.getAccount(this.config.publicKey);
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.config.networkPassphrase })
      .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
    const sim = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`${method} simulation failed: ${"error" in sim ? String(sim.error) : "no result"}`);
    const retval = sim.result!.retval;
    if (keepScVal) return retval.switch().name === "scvVoid" ? null : retval;
    return scValToNative(retval);
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

  /**
   * The wallet's XOXNO position NFT, or null when the wallet has no XOXNO account yet. One NFT per account; the
   * image URL is an SVG rendered by XOXNO's API for that account.
   */
  async readPositionNft(address: string): Promise<PositionNft | null> {
    const nft = this.config.positionNft ?? XOXNO_POSITION_NFT;
    const balance = await this.raw(nft, "balance", [new Address(address).toScVal()]) as number;
    if (!balance) return null;
    const tokenId = await this.raw(nft, "get_owner_token_id", [new Address(address).toScVal(), xdr.ScVal.scvU32(0)]) as number;
    const [name, symbol, imageUrl] = await Promise.all([
      this.raw(nft, "name", []) as Promise<string>,
      this.raw(nft, "symbol", []) as Promise<string>,
      this.raw(nft, "token_uri", [xdr.ScVal.scvU32(tokenId)]) as Promise<string>,
    ]);
    return { contract: nft, tokenId, name, symbol, imageUrl };
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

  async latestLedger(): Promise<number> {
    return (await this.server.getLatestLedger()).sequence;
  }

  async listIds(user: string): Promise<number[]> {
    const router = await this.client<Router>(this.config.router);
    return (await router.list_ids({ user })).result as number[];
  }

  async listUsers(): Promise<string[]> {
    const router = await this.client<Router>(this.config.router);
    return (await router.list_users({})).result as string[];
  }

  /** The stored autopilot in the JSON shape of `autopilotSchema`, or null when the id is unknown. */
  async readAutopilot(user: string, id: number): Promise<Autopilot | null> {
    const raw = await this.raw(this.config.router, "get_autopilot", [new Address(user).toScVal(), xdr.ScVal.scvU32(id)], true);
    return raw ? decodeAutopilot(raw as xdr.ScVal) : null;
  }

  async simulateTick(user: string, id: number): Promise<Executed | null> {
    const router = await this.client<Router>(this.config.router);
    return ((await router.tick({ user, id })).result as Executed | undefined) ?? null;
  }

  async checkAutopilot(user: string, id: number): Promise<RuleState[]> {
    const router = await this.client<Router>(this.config.router);
    return (await router.check({ user, id })).result as RuleState[];
  }

  /**
   * `Fired` events for one wallet from `startLedger` to now. The RPC answers a window wider than a few thousand
   * ledgers with an empty list instead of an error, so the range is walked in windows and each window is paged.
   */
  async readFired(user: string, startLedger: number, limit = 100): Promise<FiredEvent[]> {
    const latest = (await this.server.getLatestLedger()).sequence;
    const topics = [[xdr.ScVal.scvSymbol("fired").toXDR("base64"), new Address(user).toScVal().toXDR("base64")]];
    const out: FiredEvent[] = [];
    for (let from = Math.max(startLedger, 1); from <= latest && out.length < limit; from += EVENT_WINDOW) {
      const to = Math.min(from + EVENT_WINDOW - 1, latest);
      let cursor: string | undefined;
      do {
        const res = await this.server.getEvents(cursor ? { cursor, limit: EVENT_PAGE, filters: [{ type: "contract", contractIds: [this.config.router], topics }] } : { startLedger: from, endLedger: to, limit: EVENT_PAGE, filters: [{ type: "contract", contractIds: [this.config.router], topics }] });
        for (const event of res.events) {
          if (event.ledger > to) break;
          const value = scValToNative(event.value) as Omit<FiredEvent, "ledger" | "txHash" | "user"> & { branch?: string };
          // Router v1 (before 2026-09-20) emitted `Fired { branch, ... }`; those are not autopilot events.
          if (typeof value.kind !== "string") continue;
          out.push({ ledger: event.ledger, txHash: event.txHash, user, ...value });
        }
        cursor = res.events.length === EVENT_PAGE && res.events[res.events.length - 1]!.ledger <= to ? res.cursor : undefined;
      } while (cursor && out.length < limit);
    }
    return out.slice(0, limit);
  }
}
