import { describe, expect, it } from "vitest";
import { amountLabel, applyCapital, capitalOf } from "./capital";
import { makeRule } from "./autopilot";

const r = (amount: "all" | number | { percent: number }) => makeRule({ name: "r", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount } });

describe("capitalOf", () => {
  it("is 100 when every rule takes everything", () => expect(capitalOf([r("all"), r("all")])).toBe(100));
  it("is the share when every non-fixed rule agrees, fixed amounts ignored", () => expect(capitalOf([r({ percent: 50 }), r(25), r({ percent: 50 })])).toBe(50));
  it("is mixed when shares differ", () => expect(capitalOf([r("all"), r({ percent: 50 })])).toBe("mixed"));
  it("is null with only fixed amounts or no rules", () => { expect(capitalOf([r(25)])).toBeNull(); expect(capitalOf([])).toBeNull(); });
});

describe("applyCapital", () => {
  it("sets the share on every non-fixed rule and leaves fixed amounts", () => {
    const out = applyCapital([r("all"), r(25), r({ percent: 10 })], 50);
    expect(out.map((x) => x.action.amount)).toEqual([{ percent: 50 }, 25, { percent: 50 }]);
  });
  it("reads 100 back as everything and clamps", () => {
    expect(applyCapital([r({ percent: 10 })], 100)[0]!.action.amount).toBe("all");
    expect(applyCapital([r("all")], 0)[0]!.action.amount).toEqual({ percent: 1 });
  });
});

describe("amountLabel", () => {
  it("names the three forms", () => {
    expect(amountLabel("all")).toBe("everything");
    expect(amountLabel({ percent: 50 })).toBe("50%");
    expect(amountLabel(25)).toBe("25 USDC");
  });
});
