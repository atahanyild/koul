/**
 * One consistent story, used wherever the chain wiring is not finished.
 *
 *   Ayşe deposited ₺7,318.50 three hours ago and received 150.00 USDC at 48.79.
 *   She supplied 20.00 USDC to Pool A and 100.00 to Pool B, kept 30.00 in the wallet, and armed "Lira shield".
 *   Twelve minutes ago the autopilot moved the 20.00 from Pool A (1.35%) to Pool B (5.56%).
 *   Now: wallet 30.00, Pool A 0.00, Pool B 120.00, no loan. USD/TRY 48.79, exit level 50.
 *
 * Every number on every screen derives from these constants.
 */
import type { ActivityItem, FxPrice, Health, Pool, Positions, Transfer } from "./types";
import { POOLS, type Autopilot } from "@/lib/model/autopilot";

export const MOCK_FX = 48.79;

export const MOCK_POOLS: Pool[] = [
  { ...POOLS.A, supplyApy: 1.35, borrowApy: 3.9, utilization: 0.34, availableUsdc: 1204, totalSuppliedUsdc: 1824 },
  { ...POOLS.B, supplyApy: 5.56, borrowApy: 8.1, utilization: 0.68, availableUsdc: 388, totalSuppliedUsdc: 1212 },
];

export const MOCK_POSITIONS: Positions = {
  idleUsdc: 30,
  idleXlm: 412.5,
  supplied: { A: 0, B: 120 },
  borrowed: { A: 0, B: 0 },
  accountId: "12",
};

export const MOCK_HEALTH: Health = { factor: null, hasLoan: false, minimum: 1.25, liquidationAt: 1 };

export const mockFx = (now = Date.now()): FxPrice => ({ tryPerUsd: MOCK_FX, timestamp: Math.floor(now / 1000) - 42, ageSec: 42, stale: false, maxAgeSec: 900 });

/** Real testnet hashes from the build log, so every explorer link resolves. */
export const TX = {
  rebalance: "e3b7a9bcac4ddf61738086ffdff1aba521ed1aa3eb79ae594dc47c2aeb59c0da",
  fxExit: "dbd7bbc882aa5bff4af270c6105573760ee110307823a4b6a6c8cd559e0d8fed",
  transfer: "8d473020af5230197ec9140ce62d40f4bdb7a04aa0ccef4675d6d45fdc4014cb",
  anchorPay: "2a5be8866b8359602072fcc3f1dfadf9073ae996bff318d8075b230ba64a98c7",
  cleanup: "e070a0939a5ce1c0cd90968a597258e58b2a884a8d41ca9158adc05858a67def",
};

const MIN = 60_000;
const H = 3_600_000;

export function mockAutopilots(now = Date.now()): Autopilot[] {
  return [
    {
      id: "lira-shield",
      name: "Lira shield",
      description: "Keep my USDC in whichever pool pays more, never let my loan health drop under 1.25, and if the lira goes past 50 pull everything back to my wallet.",
      status: "armed",
      createdAt: now - 62 * MIN,
      armedUntil: now + 6 * 24 * H + 19 * H,
      agentRuleId: 6,
      runs: 1,
      lastRunAt: now - 12 * MIN,
      rules: [
        { id: "health", name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], match: "all", action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 3600, inferred: ["cooldownSec"], enabled: true },
        { id: "rebalance", name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 1 }], match: "all", action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 6 * 3600, inferred: ["conditions.0.value", "cooldownSec"], enabled: true },
        { id: "fx", name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 86400, inferred: ["cooldownSec"], enabled: true },
      ],
    },
    {
      id: "best-rate",
      name: "Best rate only",
      description: "Move my USDC to whichever pool pays at least half a point more.",
      status: "draft",
      createdAt: now - 26 * H,
      armedUntil: null,
      agentRuleId: null,
      runs: 0,
      lastRunAt: null,
      rules: [
        { id: "rg", name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 0.5 }], match: "all", action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 12 * 3600, inferred: ["cooldownSec"], enabled: true },
      ],
    },
    {
      id: "test-run",
      name: "Test run",
      description: "If the lira passes 49, pull everything out.",
      status: "ended",
      createdAt: now - 30 * H,
      armedUntil: now - 6 * H,
      agentRuleId: null,
      runs: 1,
      lastRunAt: now - 27 * H,
      rules: [
        { id: "fx", name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 49 }], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 86400, inferred: [], enabled: true },
      ],
    },
  ];
}

export function mockActivity(now = Date.now()): ActivityItem[] {
  return [
    { id: "a1", kind: "autopilot_run", at: now - 12 * MIN, title: "Moved 20.00 USDC to Pool B", detail: "Pool B paid 5.56% against Pool A's 1.35%, more than the 1.00 pt gap you set.", amountUsdc: 0, txHash: TX.rebalance, autopilotName: "Lira shield", ruleName: "Best rate" },
    { id: "a2", kind: "autopilot_armed", at: now - 58 * MIN, title: "Lira shield armed", detail: "Koul's key is valid for 7 days and can only do what the three rules need.", txHash: TX.cleanup, autopilotName: "Lira shield" },
    { id: "a3", kind: "rules_saved", at: now - 62 * MIN, title: "Rules saved on-chain", detail: "3 rules: Stay safe, Best rate, Lira exit.", txHash: TX.anchorPay, autopilotName: "Lira shield" },
    { id: "a4", kind: "supply", at: now - 2 * H - 4 * MIN, title: "Supplied 100.00 USDC to Pool B", detail: "Earning 5.56% a year.", amountUsdc: 0, txHash: TX.transfer },
    { id: "a5", kind: "supply", at: now - 2 * H - 6 * MIN, title: "Supplied 20.00 USDC to Pool A", detail: "Earning 1.35% a year.", amountUsdc: 0, txHash: TX.fxExit },
    { id: "a6", kind: "lira_in", at: now - 3 * H - 10 * MIN, title: "₺7,318.50 arrived as 150.00 USDC", detail: "Bank transfer via FAST, reference FAST-2K9M, at 48.79.", amountUsdc: 150, amountTry: 7318.5, reference: "FAST-2K9M", txHash: TX.transfer },
    { id: "a7", kind: "lira_out", at: now - 27 * H, title: "2.00 USDC paid out as ₺97.08", detail: "Test withdrawal to TR33…1326 via FAST, reference FAST-OR36GG.", amountUsdc: -2, amountTry: 97.08, reference: "FAST-OR36GG", txHash: TX.anchorPay },
  ];
}

/** The deposit steps, in order, with plain and technical wording. State is filled in by the transfer runner. */
export const DEPOSIT_STEPS: Omit<Transfer["steps"][number], "state">[] = [
  { id: "prepare", title: "Preparing your transfer", detail: "Koul opens a temporary receiving account that forwards to your wallet on its own.", technical: "Landing account created and locked; forward and cleanup pre-authorised, sponsored by the keeper." },
  { id: "verify", title: "Checking in with the bank partner", detail: "The anchor verifies the transfer and locks your rate.", technical: "SEP-10 challenge, SEP-12 KYC, SEP-38 firm quote." },
  { id: "instructions", title: "Send the lira from your bank", detail: "Use the reference below in a FAST transfer. This step waits for you.", technical: "SEP-6 deposit-exchange opened; anchor returns FAST instructions and a reference.", waitsOn: "your bank" },
  { id: "received", title: "Lira received, sending USDC", detail: "The anchor has your lira and is sending USDC on Stellar.", technical: "Anchor watcher matched the FAST payment; classic payment to the landing account.", waitsOn: "the anchor" },
  { id: "arrived", title: "USDC is in your wallet", detail: "Done. The temporary account has closed itself.", technical: "Pre-authorised forward to the smart account, trustline removed, account merged to the sponsor." },
];

export const WITHDRAW_STEPS: Omit<Transfer["steps"][number], "state">[] = [
  { id: "quote", title: "Locking your rate", detail: "The anchor quotes today's rate for your USDC.", technical: "SEP-10 as the landing account, SEP-12, SEP-38 sell quote." },
  { id: "approve", title: "Approve with Face ID", detail: "One confirmation moves the USDC out of your wallet. The rest runs on its own.", technical: "Passkey-signed USDC SAC transfer from the smart account to the landing account.", waitsOn: "you" },
  { id: "paying", title: "Bank partner is paying your lira", detail: "The anchor sends lira to your IBAN via FAST.", technical: "Pre-authorised classic payment to the anchor treasury with the memo, fee-bumped by the keeper.", waitsOn: "the anchor" },
  { id: "done", title: "Lira is in your bank", detail: "Done. You will see the FAST reference on your statement.", technical: "Anchor status completed; landing account cleaned up and merged." },
];

/** Live-looking timings for the simulated runner, in ms per step. The "waits on" steps run longer on purpose. */
export const DEPOSIT_STEP_MS = [1800, 2600, 7000, 4200, 1600];
export const WITHDRAW_STEP_MS = [2200, 0, 6500, 1800];

export const MOCK_WALLET = "CBHMG4IGCLP36WJUMYR55N2TGDSZ4C5V6YQSBT4HWT6A77DCL3Y7UUFL";
