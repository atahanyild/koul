import { describe, expect, it } from "vitest";
import { decodeAutopilot, encodeAutopilot } from "./codec.js";
import { type Autopilot } from "./schema.js";
import { validateAutopilot } from "./validate.js";

const all = { type: "All" } as const;
const ap: Autopilot = { account_id: "18446744073709551615", rules: [
  { conditions: [{ type: "HealthFactor", cmp: "Below", level_wad: "1250000000000000000" }], match_all: true, action: { type: "RepayFromWallet", hub: 1, amount: all }, cooldown_ledgers: 30 },
  { conditions: [{ type: "SupplyRateGap", hub_over: 2, hub_under: 1, min_bps: 100 }, { type: "IdleBalance", cmp: "AtOrAbove", amount: "10000000" }], match_all: false, action: { type: "MoveSupply", from_hub: 1, to_hub: 2, amount: { type: "Percent", bps: 5000 } }, cooldown_ledgers: 300 },
  { conditions: [{ type: "FxPrice", asset: "TRY", cmp: "Below", level: "2000000000000", max_age_secs: "900" }], match_all: true, action: { type: "RepayWithCollateral", withdraw_hub: 2, repay_hub: 1, amount: { type: "Fixed", value: "10000000" } }, cooldown_ledgers: 1 },
  { conditions: [{ type: "IdleBalance", cmp: "AtOrAbove", amount: "0" }], match_all: true, action: { type: "WithdrawToWallet", hub: 2, amount: all }, cooldown_ledgers: 1 },
] };

describe("autopilot contract codec", () => {
  it("round trips every condition, action, amount, and the u64 boundary", () => {
    expect(decodeAutopilot(encodeAutopilot(ap))).toEqual(ap);
  });
  it("rejects contract-invalid values with readable paths", () => {
    expect(validateAutopilot({ ...ap, rules: [{ ...ap.rules[0], cooldown_ledgers: 0 }] })).toContain("rules.0.cooldown_ledgers must be positive");
    expect(validateAutopilot({ ...ap, rules: [{ ...ap.rules[1], action: { type: "MoveSupply", from_hub: 1, to_hub: 1, amount: all } }] })).toContain("rules.0.action: hubs must differ");
  });
});
