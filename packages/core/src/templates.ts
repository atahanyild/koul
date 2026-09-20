import type { Autopilot } from "./schema.js";

const all = { type: "All" } as const;
const fx = { type: "FxPrice", asset: "TRY", cmp: "Below", level: "2000000000000", max_age_secs: "900" } as const;
const health = { type: "HealthFactor", cmp: "Below", level_wad: "1250000000000000000" } as const;

export function liraShield(accountId: string): Autopilot {
  return { account_id: accountId, rules: [
    { conditions: [health], match_all: true, action: { type: "RepayFromWallet", hub: 1, amount: all }, cooldown_ledgers: 30 },
    { conditions: [{ type: "SupplyRateGap", hub_over: 2, hub_under: 1, min_bps: 100 }], match_all: true, action: { type: "MoveSupply", from_hub: 1, to_hub: 2, amount: all }, cooldown_ledgers: 300 },
    { conditions: [{ type: "SupplyRateGap", hub_over: 1, hub_under: 2, min_bps: 100 }], match_all: true, action: { type: "MoveSupply", from_hub: 2, to_hub: 1, amount: all }, cooldown_ledgers: 300 },
    { conditions: [fx], match_all: true, action: { type: "WithdrawToWallet", hub: 1, amount: all }, cooldown_ledgers: 30 },
    { conditions: [fx], match_all: true, action: { type: "WithdrawToWallet", hub: 2, amount: all }, cooldown_ledgers: 30 },
  ] };
}
export function yieldOnly(accountId: string): Autopilot {
  return { account_id: accountId, rules: liraShield(accountId).rules.slice(1, 3) };
}
export function healthGuard(accountId: string): Autopilot {
  return { account_id: accountId, rules: [liraShield(accountId).rules[0]!] };
}
