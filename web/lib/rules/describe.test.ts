import { describe, expect, it } from "vitest";
import { describeAction, describeCondition, describeConditions, describeRule } from "./describe";

describe("describeAction", () => {
  it("says the amount in the three forms", () => {
    expect(describeAction({ kind: "withdraw_to_wallet", amount: "all" })).toBe("Withdraw to wallet");
    expect(describeAction({ kind: "withdraw_to_wallet", amount: 50 })).toBe("Withdraw 50 USDC to wallet");
    expect(describeAction({ kind: "withdraw_to_wallet", amount: { percent: 50 } })).toBe("Withdraw 50% to wallet");
    expect(describeAction({ kind: "supply_from_wallet", amount: "all", pool: "A" })).toBe("Supply idle to Hub 1");
    expect(describeAction({ kind: "supply_from_wallet", amount: { percent: 50 }, pool: "A" })).toBe("Supply 50% of idle to Hub 1");
    expect(describeAction({ kind: "supply_from_wallet", amount: 25.5, pool: "B" })).toBe("Supply 25.5 USDC to Hub 2");
    expect(describeAction({ kind: "repay_from_wallet", amount: { percent: 25 } })).toBe("Repay 25% of debt");
    expect(describeAction({ kind: "repay_from_wallet", amount: 10 })).toBe("Repay 10 USDC");
    expect(describeAction({ kind: "move_to_best_pool", amount: "all" })).toBe("Move to the better hub");
    expect(describeAction({ kind: "move_to_best_pool", amount: { percent: 75 } })).toBe("Move 75% to the better hub");
  });
});

describe("describeCondition", () => {
  it("writes each subject the way the design does", () => {
    expect(describeCondition({ kind: "fx_price", comparator: "gte", value: 50 })).toBe("USD/TRY > 50.00");
    expect(describeCondition({ kind: "health_factor", comparator: "lte", value: 1.25 })).toBe("health < 1.25");
    expect(describeCondition({ kind: "rate_gap", comparator: "gte", value: 1 })).toBe("rate gap > 1.00%");
    expect(describeCondition({ kind: "idle_usdc", comparator: "gte", value: 100 })).toBe("wallet > 100 USDC");
    expect(describeCondition({ kind: "pool_rate", comparator: "lte", value: 2, pool: "A" })).toBe("hub 1 APY < 2.00%");
  });
  it("joins with AND or OR", () => {
    const c = [{ kind: "fx_price", comparator: "gte", value: 50 }, { kind: "idle_usdc", comparator: "gte", value: 5 }] as const;
    expect(describeConditions({ conditions: [...c], match: "all" })).toBe("USD/TRY > 50.00 AND wallet > 5 USDC");
    expect(describeConditions({ conditions: [...c], match: "any" })).toBe("USD/TRY > 50.00 OR wallet > 5 USDC");
  });
});

describe("describeRule", () => {
  it("is the line the rows show", () => {
    expect(describeRule({ conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" } })).toBe("IF USD/TRY > 50.00 → Withdraw to wallet");
  });
});
