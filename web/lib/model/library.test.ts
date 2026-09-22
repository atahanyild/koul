import { describe, expect, it } from "vitest";
import { addToLibrary, decodeRules, encodeRules, portable, shareLink, uniqueName } from "./library";
import { makeRule, type Rule } from "./autopilot";

const rules: Rule[] = [
  makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600, inferred: ["cooldownSec"] }),
  makeRule({ name: "Top up", conditions: [{ kind: "idle_usdc", comparator: "gte", value: 100 }, { kind: "pool_rate", comparator: "gte", value: 4, pool: "A" }], match: "any", action: { kind: "supply_from_wallet", amount: 50, pool: "A" }, cooldownSec: 3600, enabled: false }),
];

describe("encodeRules / decodeRules", () => {
  it("round-trips the rules with fresh ids and no inferred marks", () => {
    const out = decodeRules(encodeRules(rules, "Lira shield"));
    expect(out).not.toBeNull();
    expect(out!.name).toBe("Lira shield");
    expect(out!.rules.map(portable)).toEqual(rules.map(portable));
    expect(out!.rules[0]!.id).not.toBe(rules[0]!.id);
    expect(out!.rules[0]!.inferred).toEqual([]);
  });
  it("is URL-safe", () => {
    const token = encodeRules(rules);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(shareLink("https://koul.app", rules)).toBe(`https://koul.app/autopilot?load=${token}`);
  });
  it("rejects garbage and foreign shapes", () => {
    expect(decodeRules("not a token")).toBeNull();
    expect(decodeRules(btoa(JSON.stringify({ v: 1, rules: [{ conditions: [], action: { kind: "swap", amount: "all" }, cooldownSec: 1 }] })))).toBeNull();
  });
});

describe("uniqueName / addToLibrary", () => {
  it("numbers a taken name", () => {
    expect(uniqueName("Lira shield", [])).toBe("Lira shield");
    expect(uniqueName("Lira shield", ["Lira shield"])).toBe("Lira shield 2");
    expect(uniqueName("Lira shield", ["Lira shield", "Lira shield 2"])).toBe("Lira shield 3");
    expect(uniqueName("   ", [])).toBe("Autopilot");
  });
  it("adds a copy of the rules on top, under a unique name", () => {
    const first = addToLibrary([], "Mine", rules);
    const second = addToLibrary(first.entries, "Mine", rules);
    expect(second.entries.map((e) => e.name)).toEqual(["Mine 2", "Mine"]);
    expect(second.entry.rules[0]!.id).not.toBe(rules[0]!.id);
  });
});
