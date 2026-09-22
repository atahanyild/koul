/**
 * Capital: how much of what it could move each rule takes. "Everything" is the whole base (the idle wallet for a
 * supply or a repayment, the supplied USDC for a withdrawal or a move); a share is a percent of that base; a fixed
 * amount is a number of USDC. The capital pill sets one share for every rule at once; fixed amounts are left alone.
 */
import type { Action, Rule } from "./autopilot";

export type Amount = Action["amount"];
export const isPercent = (a: Amount): a is { percent: number } => typeof a === "object" && a !== null && "percent" in a;
export const isFixed = (a: Amount): a is number => typeof a === "number";

/** 100 for everything, the percent for a share, null for a fixed amount. */
export function shareOf(a: Amount): number | null {
  if (a === "all") return 100;
  if (isPercent(a)) return a.percent;
  return null;
}

/** The share every non-fixed rule uses, "mixed" when they differ, null when every rule is a fixed amount or there are none. */
export function capitalOf(rules: Pick<Rule, "action">[]): number | "mixed" | null {
  const shares = rules.map((r) => shareOf(r.action.amount)).filter((s): s is number => s !== null);
  if (shares.length === 0) return null;
  return shares.every((s) => s === shares[0]) ? shares[0]! : "mixed";
}

/** Every rule that is not a fixed amount takes this share; 100 reads back as everything. */
export function applyCapital<R extends Pick<Rule, "action">>(rules: R[], percent: number): R[] {
  const amount: Amount = percent >= 100 ? "all" : { percent: Math.max(1, Math.min(100, Math.round(percent))) };
  return rules.map((r) => (isFixed(r.action.amount) ? r : { ...r, action: { ...r.action, amount } }));
}

/** "everything", "50%", "25 USDC". */
export function amountLabel(a: Amount): string {
  if (a === "all") return "everything";
  if (isPercent(a)) return `${a.percent}%`;
  return `${a.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`;
}

export const CAPITAL_CHOICES = [100, 75, 50, 25, 10];
