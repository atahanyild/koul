/**
 * The autopilot model the UI is built on: an ordered list of rules, each with conditions (all or any),
 * exactly one action and a cooldown. The router is becoming this rule engine; until it does, `toRouterRules`
 * maps the three-rule "Lira shield" shape onto the current fixed `set_rules` struct and `fromRouterRules` maps back.
 */
import { tryPerUsdToUsdPerTry, usdPerTryToTryPerUsd } from "@/lib/koul";

// ---------------------------------------------------------------- pools

export type PoolId = "A" | "B";
/** Plain names for the user; the hub id is the protocol detail shown in tooltips. */
export const POOLS: Record<PoolId, { id: PoolId; name: string; hub: number; technical: string }> = {
  A: { id: "A", name: "Pool A", hub: 1, technical: "XOXNO hub 1 (USDC) on spoke 3" },
  B: { id: "B", name: "Pool B", hub: 2, technical: "XOXNO hub 2 (USDC_HUB2) on spoke 3" },
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
  rate_gap: { subject: "the better pool pays more by", unit: "pts", technical: "|deposit_rate(hub_b) − deposit_rate(hub_a)| in basis points, annualised" },
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

// ---------------------------------------------------------------- adapter to the current router

/** The `Rules` struct the deployed router stores today. */
export interface RouterRules {
  account_id: bigint;
  hub_a: number;
  hub_b: number;
  rebalance_threshold_bps: number;
  min_health_factor_wad: bigint;
  fx_enabled: boolean;
  fx_asset: string;
  fx_level: bigint;
  fx_above: boolean;
  max_price_age_secs: bigint;
}

export const MAX_PRICE_AGE_SECS = 900n;

/**
 * Map the UI rules onto the fixed three-branch router. Rules the router cannot express are returned in `unsupported`
 * so the UI can say so before the passkey prompt. Order is imposed by the router (health > rebalance > fx exit).
 */
export function toRouterRules(ap: Pick<Autopilot, "rules">, accountId: bigint): { rules: RouterRules; unsupported: Rule[] } {
  const rules: RouterRules = {
    account_id: accountId,
    hub_a: 1,
    hub_b: 2,
    rebalance_threshold_bps: 0,
    min_health_factor_wad: 0n,
    fx_enabled: false,
    fx_asset: "TRY",
    fx_level: tryPerUsdToUsdPerTry(50),
    fx_above: false,
    max_price_age_secs: MAX_PRICE_AGE_SECS,
  };
  const unsupported: Rule[] = [];
  for (const r of ap.rules) {
    if (!r.enabled) continue;
    const single = r.conditions.length === 1 ? r.conditions[0] : null;
    if (r.action.kind === "repay_from_wallet" && single?.kind === "health_factor" && single.comparator === "lte" && rules.min_health_factor_wad === 0n) {
      rules.min_health_factor_wad = BigInt(Math.round(single.value * 1e6)) * 10n ** 12n;
    } else if (r.action.kind === "move_to_best_pool" && single?.kind === "rate_gap" && single.comparator === "gte" && rules.rebalance_threshold_bps === 0) {
      rules.rebalance_threshold_bps = Math.round(single.value * 100);
    } else if (r.action.kind === "withdraw_to_wallet" && single?.kind === "fx_price" && single.comparator === "gte" && !rules.fx_enabled) {
      rules.fx_enabled = true;
      // The oracle quotes USD per TRY, so "TRY per USD >= level" is "USD per TRY <= 1/level".
      rules.fx_level = tryPerUsdToUsdPerTry(single.value);
      rules.fx_above = false;
    } else {
      unsupported.push(r);
    }
  }
  return { rules, unsupported };
}

/** Read the router's fixed struct back into rule cards, in the order the router evaluates them. */
export function fromRouterRules(r: RouterRules): Rule[] {
  const out: Rule[] = [];
  if (r.min_health_factor_wad > 0n) {
    out.push(makeRule({ id: "health", name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: Number(r.min_health_factor_wad) / 1e18 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 3600 }));
  }
  if (r.rebalance_threshold_bps > 0) {
    out.push(makeRule({ id: "rebalance", name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: r.rebalance_threshold_bps / 100 }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 6 * 3600 }));
  }
  if (r.fx_enabled) {
    out.push(makeRule({ id: "fx", name: "Lira exit", conditions: [{ kind: "fx_price", comparator: r.fx_above ? "lte" : "gte", value: Number(usdPerTryToTryPerUsd(r.fx_level).toFixed(2)) }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 86400 }));
  }
  return out;
}

/** The plain-language permission list the arm sheet shows, derived from the rules. */
export function permissionsFor(ap: Pick<Autopilot, "rules">): { can: string[]; technical: string[] } {
  const kinds = new Set(ap.rules.filter((r) => r.enabled).map((r) => r.action.kind));
  const can: string[] = [];
  const technical: string[] = ["router.tick"];
  if (kinds.has("move_to_best_pool")) { can.push("Move your USDC between Pool A and Pool B"); technical.push("controller.withdraw", "controller.supply", "usdc.transfer → XOXNO pool only"); }
  if (kinds.has("repay_from_wallet")) { can.push("Repay your loan with USDC from this wallet"); technical.push("controller.repay"); }
  if (kinds.has("withdraw_to_wallet")) { can.push("Withdraw your USDC from the pools back into this wallet"); technical.push("controller.withdraw"); }
  return { can, technical: [...new Set(technical)] };
}
