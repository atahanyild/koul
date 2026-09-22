/**
 * The one wording for a rule, wherever it shows: Home, the running tile, the editor, the library, the chat draft.
 * Conditions are mono ("USD/TRY > 50.00"), actions are plain words with the amount in them ("Withdraw 50 USDC to
 * wallet", "Supply 50% of idle to Hub 1").
 */
import { POOLS, type Action, type Condition, type Rule } from "@/lib/model/autopilot";
import { isPercent } from "@/lib/model/capital";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** `gte` reads as ">" and `lte` as "<", the way the design writes conditions. */
const op = (c: Condition) => (c.comparator === "gte" ? ">" : "<");

export function describeCondition(c: Condition): string {
  switch (c.kind) {
    case "rate_gap": return `rate gap > ${n2(c.value)}%`;
    case "pool_rate": return `hub ${POOLS[c.pool ?? "B"].hub} APY ${op(c)} ${n2(c.value)}%`;
    case "health_factor": return `health ${op(c)} ${n2(c.value)}`;
    case "fx_price": return `USD/TRY ${op(c)} ${n2(c.value)}`;
    case "idle_usdc": return `wallet ${op(c)} ${n0(c.value)} USDC`;
  }
}

export function describeConditions(rule: Pick<Rule, "conditions" | "match">): string {
  return rule.conditions.map(describeCondition).join(rule.match === "all" ? " AND " : " OR ");
}

/** "everything" → nothing said, a share → "50%", a fixed amount → "50 USDC". */
export function describeAmount(a: Action["amount"]): string | null {
  if (a === "all") return null;
  if (isPercent(a)) return `${a.percent}%`;
  return `${n0(a)} USDC`;
}

export function describeAction(a: Action): string {
  const amt = describeAmount(a.amount);
  const share = isPercent(a.amount);
  switch (a.kind) {
    case "repay_from_wallet": return amt ? (share ? `Repay ${amt} of debt` : `Repay ${amt}`) : "Repay debt";
    case "withdraw_to_wallet": return amt ? `Withdraw ${amt} to wallet` : "Withdraw to wallet";
    case "move_to_best_pool": return amt ? `Move ${amt} to the better hub` : "Move to the better hub";
    case "supply_from_wallet": {
      const hub = `Hub ${POOLS[a.pool ?? "B"].hub}`;
      return amt ? (share ? `Supply ${amt} of idle to ${hub}` : `Supply ${amt} to ${hub}`) : `Supply idle to ${hub}`;
    }
  }
}

/** "IF USD/TRY > 50.00 → Withdraw to wallet", for places that want one string. */
export function describeRule(rule: Pick<Rule, "conditions" | "match" | "action">): string {
  return `IF ${describeConditions(rule)} → ${describeAction(rule.action)}`;
}
