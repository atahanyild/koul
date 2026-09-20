import { autopilotSchema, type Autopilot } from "./schema";

const I128_MAX = (1n << 127n) - 1n;
const U64_MAX = (1n << 64n) - 1n;
const MIN_MOVE = 10_000_000n;

/** Returns user-facing errors; an empty array means the router accepts the shape and limits. */
export function validateAutopilot(input: unknown): string[] {
  const parsed = autopilotSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues.map((i) => `${i.path.join(".") || "autopilot"}: ${i.message}`);
  const ap: Autopilot = parsed.data;
  const errors: string[] = [];
  if (BigInt(ap.account_id) > U64_MAX) errors.push("account_id exceeds u64");
  ap.rules.forEach((rule, i) => {
    const path = `rules.${i}`;
    if (rule.cooldown_ledgers === 0) errors.push(`${path}.cooldown_ledgers must be positive`);
    rule.conditions.forEach((condition, j) => {
      const p = `${path}.conditions.${j}`;
      if (condition.type === "SupplyRateGap" && condition.hub_over === condition.hub_under) errors.push(`${p}: hubs must differ`);
      if (condition.type === "SupplyRateGap" && condition.min_bps === 0) errors.push(`${p}.min_bps must be positive`);
      if (condition.type === "FxPrice" && BigInt(condition.max_age_secs) === 0n) errors.push(`${p}.max_age_secs must be positive`);
      const values = condition.type === "HealthFactor" ? [condition.level_wad] : condition.type === "FxPrice" ? [condition.level] : condition.type === "IdleBalance" ? [condition.amount] : [];
      for (const value of values) if (BigInt(value) > I128_MAX) errors.push(`${p}: value exceeds i128`);
      if (condition.type === "FxPrice" && BigInt(condition.max_age_secs) > U64_MAX) errors.push(`${p}.max_age_secs exceeds u64`);
    });
    const action = rule.action;
    if (action.type === "MoveSupply" && action.from_hub === action.to_hub) errors.push(`${path}.action: hubs must differ`);
    if (action.amount.type === "Percent" && (action.amount.bps < 1 || action.amount.bps > 10_000)) errors.push(`${path}.action.amount.bps must be 1..10000`);
    if (action.amount.type === "Fixed" && BigInt(action.amount.value) < MIN_MOVE) errors.push(`${path}.action.amount.value must be at least 1 USDC (10000000 units)`);
    if (action.amount.type === "Fixed" && BigInt(action.amount.value) > I128_MAX) errors.push(`${path}.action.amount.value exceeds i128`);
  });
  return errors;
}
