import { describe, expect, it } from "vitest";
import { answerLocally } from "./fallback";
import type { ChatMessage } from "./reducer";
import type { Rule } from "@/lib/model/autopilot";

const live = { fx: 48.79, healthFactor: 2.1, hasLoan: true, rateA: 3.1, rateB: 4.2, idleUsdc: 50 };
const health: Rule = { id: "h", name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], match: "all", action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 600, inferred: [], enabled: true };
const gap: Rule = { id: "g", name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 1 }], match: "all", action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 3600, inferred: [], enabled: true };

describe("local answers", () => {
  it("asks for the level when the sentence has none, with replies around today's reading", () => {
    const r = answerLocally([{ role: "user", text: "Exit if the lira drops" }], [health, gap], "live", live);
    expect(r.kind).toBe("clarify");
    expect(r.message).toBe("At what USD/TRY level? It is 48.79 now.");
    expect(r.choices).toEqual(["49.00", "50.00", "51.00"]);
    expect(r.pending?.conditions[0]?.kind).toBe("fx_price");
  });
  it("turns the answer into a draft placed before the rate rule", () => {
    const first = answerLocally([{ role: "user", text: "Exit if the lira drops" }], [health, gap], "live", live);
    const msgs: ChatMessage[] = [{ role: "user", text: "Exit if the lira drops" }, { role: "koul", text: first.message, pending: first.pending }, { role: "user", text: "50.00" }];
    const r = answerLocally(msgs, [health, gap], "live", live);
    expect(r.kind).toBe("draft");
    expect(r.position).toBe(2);
    expect(r.message).toBe("Here is the rule. It would run second, before the rate gap rule.");
    expect(r.rules?.[1]?.conditions[0]?.value).toBe(50);
    expect(r.rules?.[1]?.cooldownSec).toBe(600);
  });
  it("a follow-up changes the draft in place", () => {
    const d = answerLocally([{ role: "user", text: "Pull everything back to my wallet if USD/TRY passes 50" }], [health, gap], "live", live);
    expect(d.kind).toBe("draft");
    const r = answerLocally([{ role: "user", text: "…" }, { role: "koul", text: d.message, rules: d.rules, position: d.position }, { role: "user", text: "make it 51" }], [health, gap], "live", live);
    expect(r.kind).toBe("draft");
    expect(r.rules?.[r.position! - 1]?.conditions[0]?.value).toBe(51);
  });
  it("in editing mode a sentence changes the named rule", () => {
    const fx: Rule = { ...health, id: "f", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" } };
    const r = answerLocally([{ role: "user", text: "make the lira exit 51" }], [health, fx, gap], "editing", live);
    expect(r).toMatchObject({ kind: "draft", position: 2, message: "Changed rule 2 · 50.00 → 51.00." });
    expect(r.rules?.[1]?.conditions[0]?.value).toBe(51);
    expect(r.rules?.[0]).toEqual(health);
  });
  it("says what it can do when it cannot", () => {
    const r = answerLocally([{ role: "user", text: "buy gold every friday" }], [], "live", live);
    expect(r.kind).toBe("unsupported");
    expect(r.message).toMatch(/health, hub rates, USD\/TRY/);
  });
});
