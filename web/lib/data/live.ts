/**
 * Live readers against Stellar testnet through `@koul/core`. Every function throws on failure; the hooks show the
 * error and keep the last good value. Reads simulate with the keeper's public G-account as source, no signature.
 */
import { KoulReader, type Autopilot as CoreAutopilot, type FiredEvent, type PositionNft, type RuleState } from "@koul/core";
import type { ContextRule } from "smart-account-kit";
import { MAX_PRICE_AGE_SECS, READ_CONFIG, usdPerTryToTryPerUsd } from "@/lib/koul";
import { fromUnits } from "@/lib/format";
import { POOLS, poolByHub, type PoolId } from "@/lib/model/autopilot";
import type { ActivityItem, FxPrice, Health, Pool, Positions } from "./types";

export const reader = new KoulReader(READ_CONFIG);
const RAY = 1e27;
const WAD = 1e18;
const LEDGER_MS = 5000;

/** Annual deposit and borrow rates and liquidity for both USDC hubs. */
export async function readPools(): Promise<Pool[]> {
  // The hub reads need no account: pass a known account id so readPortfolio walks the hubs. Balances are ignored.
  const p = await reader.readPortfolio(READ_CONFIG.publicKey, 0n);
  return p.hubs.map((h) => {
    const id = poolByHub(h.hub);
    const suppliedN = fromUnits(h.supplied);
    const borrowedN = fromUnits(h.borrowed);
    const util = suppliedN > 0 ? borrowedN / suppliedN : 0;
    const supplyApy = Number(h.depositRate) / RAY * 100;
    // The pool exposes the deposit rate; the borrow rate is derived from utilisation.
    const borrowApy = util > 0 ? supplyApy / util : 0;
    return { ...POOLS[id], supplyApy, borrowApy, utilization: util, availableUsdc: fromUnits(h.cash), totalSuppliedUsdc: suppliedN };
  });
}

export interface WalletPortfolio { positions: Positions; health: Health; nft: PositionNft | null }

/** The wallet's idle balances, its XOXNO account (from the position NFT) and its position, when it has one. */
export async function readWalletPortfolio(address: string): Promise<WalletPortfolio> {
  const nft = await reader.readPositionNft(address);
  const accountId = nft ? BigInt(nft.tokenId) : undefined;
  const p = await reader.readPortfolio(address, accountId);
  const supplied: Record<PoolId, number> = { A: 0, B: 0 };
  const borrowed: Record<PoolId, number> = { A: 0, B: 0 };
  for (const h of p.hubs) {
    const id = poolByHub(h.hub);
    supplied[id] = fromUnits(h.collateral);
    borrowed[id] = fromUnits(h.debt);
  }
  const hasLoan = borrowed.A + borrowed.B > 0.000001;
  const hf = p.healthFactor;
  const factor = hf === undefined || hf > 10n ** 30n || !hasLoan ? null : Number(hf) / WAD;
  return {
    positions: { idleUsdc: fromUnits(p.idleUsdc), idleXlm: fromUnits(p.xlm), supplied, borrowed, accountId: accountId === undefined ? null : accountId.toString() },
    health: { factor, hasLoan, minimum: 1.25, liquidationAt: 1 },
    nft,
  };
}

/** USD/TRY read directly from the mock oracle; the admin write lives in the oracle-admin app. */
export async function readFx(): Promise<FxPrice> {
  const o = await reader.readOracle("TRY");
  if (!o) throw new Error("The oracle has no TRY price");
  return { tryPerUsd: usdPerTryToTryPerUsd(o.price), timestamp: Number(o.timestamp), ageSec: o.ageSeconds, stale: o.ageSeconds > MAX_PRICE_AGE_SECS, maxAgeSec: MAX_PRICE_AGE_SECS };
}

export interface ChainAutopilot { id: number; autopilot: CoreAutopilot }

/** Every autopilot the router holds for this wallet, by id. */
export async function readChainAutopilots(address: string): Promise<ChainAutopilot[]> {
  const ids = await reader.listIds(address);
  const list = await Promise.all(ids.map(async (id) => ({ id, autopilot: await reader.readAutopilot(address, id) })));
  return list.filter((x): x is ChainAutopilot => x.autopilot !== null);
}

export const readCheck = (address: string, id: number): Promise<RuleState[]> => reader.checkAutopilot(address, id);

export interface Fired extends FiredEvent { at: number }

/** Every rule the router executed for this wallet in the last week, newest first. */
export async function readFired(address: string): Promise<Fired[]> {
  const latest = await reader.latestLedger();
  const events = await reader.readFired(address, Math.max(1, latest - 17280 * 7), 200);
  const now = Date.now();
  return events.map((e) => ({ ...e, at: now - (latest - e.ledger) * LEDGER_MS })).reverse();
}

const pool = (h: number) => POOLS[poolByHub(h)].name;
const usdc = (v: bigint) => fromUnits(v).toFixed(2);

export function firedToActivity(f: Fired): ActivityItem {
  const amt = usdc(f.amount);
  const first = f.observed[0];
  const base = { id: f.txHash, kind: "autopilot_run" as const, at: f.at, txHash: f.txHash, autopilotName: `Autopilot ${f.autopilot_id}`, ruleName: `Rule ${f.rule_index + 1}` };
  switch (f.kind) {
    case "move_supply":
      return { ...base, title: `Moved ${amt} USDC from ${pool(f.from_hub)} to ${pool(f.to_hub)}`, detail: first !== undefined ? `${pool(f.to_hub)} paid ${(Number(first) / 100).toFixed(2)} points more.` : "" };
    case "repay_wallet":
      return { ...base, title: `Repaid ${amt} USDC from the wallet`, detail: first !== undefined && first < 10n ** 30n ? `Loan health was ${(Number(first) / WAD).toFixed(2)}, under your minimum.` : "" };
    case "repay_collateral":
      return { ...base, title: `Repaid ${amt} USDC from ${pool(f.from_hub)}`, detail: first !== undefined && first < 10n ** 30n ? `Loan health was ${(Number(first) / WAD).toFixed(2)}, under your minimum.` : "" };
    case "withdraw":
      return { ...base, title: `Withdrew ${amt} USDC from ${pool(f.from_hub)} to the wallet`, detail: first !== undefined && first > 0n ? `USD/TRY was ${usdPerTryToTryPerUsd(first).toFixed(2)}.` : "" };
    default:
      return { ...base, title: `${f.kind}: ${amt} USDC`, detail: "" };
  }
}

/** Agent rules on the smart account: the rules that carry the keeper's Ed25519 key. */
export function agentRulesOf(rules: ContextRule[], ed25519Verifier: string | undefined): ContextRule[] {
  return rules.filter((r) => r.signers.some((s) => s.tag === "External" && ed25519Verifier === s.values[0]));
}
