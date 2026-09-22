import { describe, expect, it } from "vitest";
import { describeChanges, diffRules } from "./diff";
import type { Rule } from "@/lib/model/autopilot";

const r = (id: string, value: number): Rule => ({ id, name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value }], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600, inferred: [], enabled: true });

describe("chat edits", () => {
  it("names a changed level as old → new, and undo brings the old list back", () => {
    const before = [r("a", 1.25), r("b", 50)];
    const after = [r("a", 1.25), r("b", 51)];
    const changes = diffRules(before, after);
    expect(changes).toEqual([{ id: "b", position: 2, kind: "changed", before: "USD/TRY > 50.00", after: "USD/TRY > 51.00", fromValue: "50.00", toValue: "51.00" }]);
    expect(describeChanges(changes)).toBe("Changed rule 2 · 50.00 → 51.00");
    // an undo is a return to the previous list, which diffs to nothing
    expect(diffRules(after, before)[0]?.toValue).toBe("50.00");
    expect(diffRules(before, before)).toEqual([]);
  });
  it("sees an added and a removed rule", () => {
    expect(diffRules([r("a", 50)], [r("a", 50), r("n", 47)])).toEqual([{ id: "n", position: 2, kind: "added" }]);
    expect(describeChanges(diffRules([r("a", 50), r("b", 51)], [r("b", 51)]))).toBe("Removed rule 1");
  });
});
