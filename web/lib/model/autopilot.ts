/**
 * The autopilot model the UI is built on: an ordered list of rules, each with conditions (all or any),
 * exactly one action and a cooldown. `toCoreAutopilot` maps it onto the router's `Autopilot` type from `@koul/core`
 * and `fromCoreAutopilot` maps back.
 */
import type { Action as CoreAction, Amount as CoreAmount, Autopilot as CoreAutopilot, Condition as CoreCondition, Rule as CoreRule } from "@koul/core";
import { LEDGER_SECONDS, MAX_PRICE_AGE_SECS, tryPerUsdToUsdPerTry, usdPerTryToTryPerUsd } from "@/lib/koul";

// ---------------------------------------------------------------- pools

export type PoolId = "A" | "B";
/** Plain names for the user; the hub id is the protocol detail shown in tooltips. */
export const POOLS: Record<PoolId, { id: PoolId; name: string; hub: number; technical: string }> = {
  A: { id: "A", name: "USDC · Main hub", hub: 1, technical: "XOXNO market USDC on hub 1 (Main), spoke 3" },
  B: { id: "B", name: "USDC · Secondary hub", hub: 2, technical: "XOXNO market USDC_HUB2 on hub 2 (Secondary), spoke 3" },
};
export const poolByHub = (hub: number): PoolId => (hub === 2 ? "B" : "A");

// ---------------------------------------------------------------- vocabulary

/** What the router can actually check. Anything outside this list is flagged, never invented. */
export type ConditionKind = "rate_gap" | "health_factor" | "fx_price" | "idle_usdc";
export type Comparator = "gte" | "lte";

export interface Condition {
  kind: ConditionKind;
  comparator: Comparator;
  value: number;
}

/** What the router can actually do. One action per rule. */
export type ActionKind = "move_to_best_pool" | "repay_from_wallet" | "withdraw_to_wallet";

export interface Action {
  kind: ActionKind;
  /** "all" or a fixed USDC amount. Only "all" is executable today. */
  amount: "all" | number;
}

export interface Rule {
  id: string;
  name: string;
  conditions: Condition[];
  match: "all" | "any";
  action: Action;
  cooldownSec: number;
  /** Field paths Koul filled in that the user did not state, e.g. ["cooldownSec", "conditions.0.value"]. */
  inferred: string[];
  enabled: boolean;
}

export type AutopilotStatus = "draft" | "armed" | "paused" | "ended";

export interface Autopilot {
  id: string;
  name: string;
  /** The sentence the user typed, kept so the page can show it again. */
  description: string;
  rules: Rule[];
  status: AutopilotStatus;
  createdAt: number;
  /** Unix ms when the agent key expires, when armed. */
  armedUntil: number | null;
  /** Rule id of the agent rule on the smart account, when armed. */
  agentRuleId: number | null;
  runs: number;
  lastRunAt: number | null;
}

export const CONDITION_LABELS: Record<ConditionKind, { subject: string; unit: string; technical: string }> = {
  rate_gap: { subject: "the better hub pays more by", unit: "pts", technical: "|deposit_rate(hub_b) − deposit_rate(hub_a)| in basis points, the pool's annualised simple rate (APR, not the compounded APY XOXNO shows)" },
  health_factor: { subject: "my loan health", unit: "", technical: "XOXNO controller get_health_factor (WAD); liquidation at 1.00" },
  fx_price: { subject: "USD/TRY", unit: "", technical: "Reflector-shaped oracle lastprice(TRY), USD per TRY with 14 decimals, inverted" },
  idle_usdc: { subject: "idle USDC in my wallet", unit: "USDC", technical: "USDC SAC balance of the smart account" },
};

export const COMPARATOR_LABELS: Record<Comparator, string> = { gte: "is at or above", lte: "is at or below" };

export const ACTION_LABELS: Record<ActionKind, { sentence: (amount: Action["amount"]) => string; technical: string }> = {
  move_to_best_pool: {
    sentence: (a) => `move ${a === "all" ? "all" : `${a} USDC of`} my supplied USDC to the pool that pays more`,
    technical: "controller.withdraw from the lower-rate hub, controller.supply to the higher-rate hub, one transaction",
  },
  repay_from_wallet: {
    sentence: (a) => `repay ${a === "all" ? "my loan" : `${a} USDC of my loan`} from the USDC in my wallet`,
    technical: "controller.repay with idle wallet USDC, debt rounded up by one grain",
  },
  withdraw_to_wallet: {
    sentence: (a) => `withdraw ${a === "all" ? "everything" : `${a} USDC`} from the pools to my wallet`,
    technical: "controller.withdraw from every hub to the smart account; stays armed while over 1 USDC remains",
  },
};

export const COOLDOWN_OPTIONS = [
  { value: 1800, label: "30 min" },
  { value: 3600, label: "1 h" },
  { value: 6 * 3600, label: "6 h" },
  { value: 12 * 3600, label: "12 h" },
  { value: 86400, label: "24 h" },
];

// ---------------------------------------------------------------- live evaluation

/** Everything a condition can be checked against. Nulls mean "not available right now". */
export interface LiveValues {
  rateA: number | null; // percent, e.g. 1.35
  rateB: number | null;
  healthFactor: number | null; // null = no loan (infinite)
  hasLoan: boolean;
  fx: number | null; // TRY per USD
  fxStale: boolean;
  idleUsdc: number | null;
  suppliedA: number | null;
  suppliedB: number | null;
}

export interface ConditionEval {
  met: boolean | null; // null when the value is unavailable
  now: number | null;
  nowLabel: string;
}

export interface RuleEval {
  ruleId: string;
  conditions: ConditionEval[];
  /** All/any of the conditions hold. */
  conditionsMet: boolean;
  /** The action has something to do (funds to move, a loan to repay). */
  actionable: boolean;
  /** Why it would not run even though conditions hold. */
  blocker: string | null;
  /** Human sentence of what the action would do right now. */
  wouldDo: string;
  /** This rule is the first that would run. */
  wouldRun: boolean;
}

export interface AutopilotEval {
  rules: RuleEval[];
  firing: RuleEval | null;
}

const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function evaluateCondition(c: Condition, live: LiveValues): ConditionEval {
  let now: number | null = null;
  let nowLabel = "—";
  switch (c.kind) {
    case "rate_gap":
      if (live.rateA !== null && live.rateB !== null) {
        now = Math.abs(live.rateB - live.rateA);
        nowLabel = `${fmt2(now)} pts`;
      }
      break;
    case "health_factor":
      if (!live.hasLoan) return { met: c.comparator === "gte", now: null, nowLabel: "no loan" };
      now = live.healthFactor;
      nowLabel = now === null ? "—" : fmt2(now);
      break;
    case "fx_price":
      now = live.fx;
      nowLabel = now === null ? "—" : `${fmt2(now)}${live.fxStale ? " (stale)" : ""}`;
      if (live.fxStale) return { met: null, now, nowLabel };
      break;
    case "idle_usdc":
      now = live.idleUsdc;
      nowLabel = now === null ? "—" : `${fmt2(now)} USDC`;
      break;
  }
  if (now === null) return { met: null, now, nowLabel };
  const met = c.comparator === "gte" ? now >= c.value : now <= c.value;
  return { met, now, nowLabel };
}

export function evaluateAutopilot(ap: Pick<Autopilot, "rules">, live: LiveValues): AutopilotEval {
  let fired = false;
  const rules = ap.rules.map<RuleEval>((r) => {
    const conditions = r.conditions.map((c) => evaluateCondition(c, live));
    const truths = conditions.map((c) => c.met === true);
    const conditionsMet = r.enabled && conditions.length > 0 && (r.match === "all" ? truths.every(Boolean) : truths.some(Boolean));
    const { actionable, blocker, wouldDo } = describeAction(r, live);
    const wouldRun = !fired && conditionsMet && actionable;
    if (wouldRun) fired = true;
    return { ruleId: r.id, conditions, conditionsMet, actionable, blocker, wouldDo, wouldRun };
  });
  return { rules, firing: rules.find((r) => r.wouldRun) ?? null };
}

function describeAction(r: Rule, live: LiveValues): { actionable: boolean; blocker: string | null; wouldDo: string } {
  const a = live.suppliedA ?? 0;
  const b = live.suppliedB ?? 0;
  switch (r.action.kind) {
    case "move_to_best_pool": {
      if (live.rateA === null || live.rateB === null) return { actionable: false, blocker: "Pool rates unavailable", wouldDo: "move supplied USDC to the better pool" };
      const bBetter = live.rateB > live.rateA;
      const from = bBetter ? "A" : "B";
      const amount = bBetter ? a : b;
      const wouldDo = `move ${fmt2(amount)} USDC from Pool ${from} to Pool ${bBetter ? "B" : "A"}`;
      if (amount < 1) return { actionable: false, blocker: `Everything is already in Pool ${bBetter ? "B" : "A"}`, wouldDo };
      return { actionable: true, blocker: null, wouldDo };
    }
    case "repay_from_wallet": {
      if (!live.hasLoan) return { actionable: false, blocker: "No loan to repay", wouldDo: "repay the loan from the wallet" };
      if ((live.idleUsdc ?? 0) < 0.01) return { actionable: false, blocker: "No idle USDC in the wallet", wouldDo: "repay the loan from the wallet" };
      return { actionable: true, blocker: null, wouldDo: `repay the loan with up to ${fmt2(live.idleUsdc ?? 0)} USDC from the wallet` };
    }
    case "withdraw_to_wallet": {
      const total = a + b;
      const wouldDo = `withdraw ${fmt2(total)} USDC to the wallet`;
      if (total < 1) return { actionable: false, blocker: "Nothing is supplied right now", wouldDo };
      return { actionable: true, blocker: null, wouldDo };
    }
  }
}

// ---------------------------------------------------------------- sentences

/** "when USD/TRY is at or above 50.00" — the pieces a rule card renders. */
export function conditionSentence(c: Condition): { subject: string; verb: string; value: string; technical: string } {
  const l = CONDITION_LABELS[c.kind];
  const value = c.kind === "rate_gap" ? `${fmt2(c.value)} pts` : c.kind === "idle_usdc" ? `${fmt2(c.value)} USDC` : fmt2(c.value);
  const verb = c.kind === "rate_gap" ? (c.comparator === "gte" ? "at least" : "at most") : COMPARATOR_LABELS[c.comparator];
  return { subject: l.subject, verb, value, technical: l.technical };
}

export function actionSentence(a: Action): string {
  return ACTION_LABELS[a.kind].sentence(a.amount);
}

// ---------------------------------------------------------------- templates

let counter = 0;
export const newId = (prefix = "r") => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const RULE_DEFAULTS = {
  health_factor: { value: 1.25, cooldownSec: 3600 },
  rate_gap: { value: 1, cooldownSec: 6 * 3600 },
  fx_price: { value: 50, cooldownSec: 86400 },
} as const;

export function makeRule(partial: Partial<Rule> & Pick<Rule, "name" | "conditions" | "action">): Rule {
  return { id: newId(), match: "all", cooldownSec: 3600, inferred: [], enabled: true, ...partial };
}

export interface Template {
  id: string;
  name: string;
  tagline: string;
  description: string;
  rules: () => Rule[];
}

export const TEMPLATES: Template[] = [
  {
    id: "lira-shield",
    name: "Lira shield",
    tagline: "Earn in dollars, protected from a lira shock.",
    description: "Keep my USDC in whichever pool pays more, never let my loan health drop under 1.25, and if the lira goes past 50 pull everything back to my wallet.",
    rules: () => [
      makeRule({ name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 3600 }),
      makeRule({ name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 1 }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 6 * 3600 }),
      makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 86400 }),
    ],
  },
  {
    id: "best-rate",
    name: "Best rate",
    tagline: "Always in the pool that pays more.",
    description: "Move my USDC to whichever pool pays at least half a point more.",
    rules: () => [makeRule({ name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 0.5 }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 12 * 3600 })],
  },
  {
    id: "loan-guard",
    name: "Loan guard",
    tagline: "Repay before liquidation, automatically.",
    description: "If my loan health drops under 1.25, repay from the USDC in my wallet.",
    rules: () => [makeRule({ name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 3600 })],
  },
];

// ---------------------------------------------------------------- adapter to the router's Autopilot

/**
 * The UI keeps rules as people say them: "the better pool pays more", "repay from the wallet", "withdraw everything".
 * The router keeps rules per hub. One UI rule can become two contract rules (one per hub or per direction); the
 * router walks them in order and skips the one with nothing to do, so the pair behaves as the sentence reads.
 */
const HUBS = [POOLS.A.hub, POOLS.B.hub] as const;
const WAD = 1e18;

const toLedgers = (sec: number) => Math.max(1, Math.round(sec / LEDGER_SECONDS));
const toUnits = (usdc: number) => BigInt(Math.round(usdc * 1e7)).toString();
const toAmount = (a: Action["amount"]): CoreAmount => (a === "all" ? { type: "All" } : { type: "Fixed", value: toUnits(a) });
const fromAmount = (a: CoreAmount): Action["amount"] => (a.type === "All" ? "all" : a.type === "Fixed" ? Number(a.value) / 1e7 : 0);

/** A UI condition as contract conditions. Rate gap is direction-less in the UI, so it yields one variant per direction. */
function toCoreConditions(c: Condition): { variants: CoreCondition[][]; unsupported: boolean } {
  switch (c.kind) {
    case "health_factor":
      return { variants: [[{ type: "HealthFactor", cmp: c.comparator === "lte" ? "Below" : "AtOrAbove", level_wad: BigInt(Math.round(c.value * 1e6)).toString() + "000000000000" }]], unsupported: false };
    case "fx_price": {
      // The oracle quotes USD per TRY, so "TRY per USD >= level" is "USD per TRY < 1/level".
      const level = tryPerUsdToUsdPerTry(c.value).toString();
      return { variants: [[{ type: "FxPrice", asset: "TRY", cmp: c.comparator === "gte" ? "Below" : "AtOrAbove", level, max_age_secs: String(MAX_PRICE_AGE_SECS) }]], unsupported: false };
    }
    case "idle_usdc":
      return { variants: [[{ type: "IdleBalance", cmp: c.comparator === "gte" ? "AtOrAbove" : "Below", amount: toUnits(c.value) }]], unsupported: false };
    case "rate_gap": {
      if (c.comparator !== "gte") return { variants: [], unsupported: true };
      const bps = Math.max(1, Math.round(c.value * 100));
      return { variants: [[{ type: "SupplyRateGap", hub_over: HUBS[1], hub_under: HUBS[0], min_bps: bps }], [{ type: "SupplyRateGap", hub_over: HUBS[0], hub_under: HUBS[1], min_bps: bps }]], unsupported: false };
    }
  }
}

export interface CoreMapping { autopilot: CoreAutopilot; unsupported: Rule[]; /** contract rule index -> UI rule id */ ruleIds: string[] }

/** Map the UI rules onto the router's autopilot. Rules the router cannot express are returned in `unsupported`. */
export function toCoreAutopilot(ap: Pick<Autopilot, "rules">, accountId: bigint): CoreMapping {
  const rules: CoreRule[] = [];
  const ruleIds: string[] = [];
  const unsupported: Rule[] = [];
  for (const r of ap.rules) {
    if (!r.enabled) continue;
    const mapped = r.conditions.map(toCoreConditions);
    if (mapped.some((m) => m.unsupported) || mapped.length === 0) { unsupported.push(r); continue; }
    const gapIndex = r.conditions.findIndex((c) => c.kind === "rate_gap");
    const cooldown_ledgers = toLedgers(r.cooldownSec);
    const amount = toAmount(r.action.amount);
    const push = (conditions: CoreCondition[], action: CoreAction) => { rules.push({ conditions, match_all: r.match === "all", action, cooldown_ledgers }); ruleIds.push(r.id); };
    const conditionsFor = (direction: 0 | 1) => mapped.map((m, i) => (i === gapIndex ? m.variants[direction]! : m.variants[0]!)).flat();
    switch (r.action.kind) {
      case "move_to_best_pool":
        if (gapIndex < 0) { unsupported.push(r); continue; }
        // Direction 0: B pays more, move A -> B. Direction 1: A pays more, move B -> A.
        push(conditionsFor(0), { type: "MoveSupply", from_hub: HUBS[0], to_hub: HUBS[1], amount });
        push(conditionsFor(1), { type: "MoveSupply", from_hub: HUBS[1], to_hub: HUBS[0], amount });
        break;
      case "repay_from_wallet":
        if (gapIndex >= 0) { unsupported.push(r); continue; }
        for (const hub of HUBS) push(conditionsFor(0), { type: "RepayFromWallet", hub, amount });
        break;
      case "withdraw_to_wallet":
        if (gapIndex >= 0) { unsupported.push(r); continue; }
        for (const hub of HUBS) push(conditionsFor(0), { type: "WithdrawToWallet", hub, amount });
        break;
    }
  }
  return { autopilot: { account_id: accountId.toString(), rules }, unsupported, ruleIds };
}

function fromCoreCondition(c: CoreCondition): Condition {
  switch (c.type) {
    case "HealthFactor": return { kind: "health_factor", comparator: c.cmp === "Below" ? "lte" : "gte", value: Number((Number(c.level_wad) / WAD).toFixed(2)) };
    case "FxPrice": return { kind: "fx_price", comparator: c.cmp === "Below" ? "gte" : "lte", value: Number(usdPerTryToTryPerUsd(BigInt(c.level)).toFixed(2)) };
    case "IdleBalance": return { kind: "idle_usdc", comparator: c.cmp === "AtOrAbove" ? "gte" : "lte", value: Number(c.amount) / 1e7 };
    case "SupplyRateGap": return { kind: "rate_gap", comparator: "gte", value: c.min_bps / 100 };
  }
}

const RULE_NAMES: Record<ActionKind, string> = { move_to_best_pool: "Best rate", repay_from_wallet: "Stay safe", withdraw_to_wallet: "Lira exit" };

/** Read the router's autopilot back into rule cards, folding the per-hub pairs back into one rule each. */
export function fromCoreAutopilot(core: CoreAutopilot): Rule[] {
  const out: Rule[] = [];
  const shapes: string[] = [];
  core.rules.forEach((r, index) => {
    const kind: ActionKind = r.action.type === "MoveSupply" ? "move_to_best_pool" : r.action.type === "WithdrawToWallet" ? "withdraw_to_wallet" : "repay_from_wallet";
    const conditions = r.conditions.map(fromCoreCondition);
    const amount = fromAmount(r.action.amount);
    const shape = JSON.stringify([kind, conditions, amount, r.match_all, r.cooldown_ledgers]);
    const prev = shapes.length ? shapes[shapes.length - 1] : null;
    if (prev === shape) return;
    shapes.push(shape);
    out.push(makeRule({ id: `chain_${index}`, name: RULE_NAMES[kind], conditions, match: r.match_all ? "all" : "any", action: { kind, amount }, cooldownSec: r.cooldown_ledgers * LEDGER_SECONDS }));
  });
  return out;
}

/** The plain-language permission list the arm sheet shows, derived from the rules. */
export function permissionsFor(ap: Pick<Autopilot, "rules">): { can: string[]; technical: string[] } {
  const kinds = new Set(ap.rules.filter((r) => r.enabled).map((r) => r.action.kind));
  const can: string[] = [];
  const technical: string[] = ["router.tick"];
  if (kinds.has("move_to_best_pool")) { can.push("Move your USDC between the two USDC hubs"); technical.push("controller.withdraw", "controller.supply", "usdc.transfer → XOXNO pool only"); }
  if (kinds.has("repay_from_wallet")) { can.push("Repay your loan with USDC from this wallet"); technical.push("controller.repay", "usdc.transfer → XOXNO pool only"); }
  if (kinds.has("withdraw_to_wallet")) { can.push("Withdraw your USDC from the pools back into this wallet"); technical.push("controller.withdraw"); }
  return { can, technical: [...new Set(technical)] };
}
