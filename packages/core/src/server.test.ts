import { describe, expect, it } from "vitest";
import { parseAutopilot, PARSE_TOOL, type ParseContext } from "./server.js";
import { healthGuard, liraShield, yieldOnly } from "./templates.js";

const context: ParseContext = { accountId: "12", hubIds: [1, 2], idleUsdc: "250000000", healthFactorWad: "1600000000000000000", depositRatesRay: { "1": "10000000000000000000000000", "2": "12000000000000000000000000" }, fxAsset: "TRY", fxPrice: "2050000000000", fxPriceAgeSeconds: 40 };
const sample = [
  ["Repay my debt if health falls below 1.25", healthGuard("12"), []],
  ["Move savings to the better paying hub", yieldOnly("12"), []],
  ["Protect me from a lira shock", liraShield("12"), []],
  ["When I have at least 10 idle USDC, repay debt", { account_id: "12", rules: [{ conditions: [{ type: "IdleBalance", cmp: "AtOrAbove", amount: "100000000" }], match_all: true, action: { type: "RepayFromWallet", hub: 1, amount: { type: "All" } }, cooldown_ledgers: 30 }] }, []],
  ["Repay hub 1 debt using hub 2 collateral", { account_id: "12", rules: [{ conditions: [{ type: "HealthFactor", cmp: "Below", level_wad: "1250000000000000000" }], match_all: true, action: { type: "RepayWithCollateral", withdraw_hub: 2, repay_hub: 1, amount: { type: "All" } }, cooldown_ledgers: 30 }] }, []],
  ["Automatically cash out to TRY and send it to my bank", null, ["Automatic TRY cash out and bank transfer are unsupported; the user must confirm cash out separately."]],
] as const;

describe("sentence parser boundary", () => {
  it.each(sample)("accepts structured output for %s", async (sentence, autopilot, notes) => {
    let sent: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: "tool_use", name: PARSE_TOOL.name, input: { autopilot, notes, defaulted_fields: autopilot ? ["rules.0.cooldown_ledgers"] : [] } }] }), { status: 200 });
    };
    const result = await parseAutopilot(sentence, context, { apiKey: "test", fetcher });
    expect(result.autopilot).toEqual(autopilot);
    expect(result.notes).toEqual(notes);
    expect((sent?.tools as Array<{ strict: boolean }>)[0]?.strict).toBe(true);
    expect((sent?.messages as Array<{ content: string }>)[0]?.content).toContain(sentence);
  });
  it("rejects a model result that names another account", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ content: [{ type: "tool_use", name: PARSE_TOOL.name, input: { autopilot: healthGuard("23"), notes: [], defaulted_fields: [] } }] }), { status: 200 });
    await expect(parseAutopilot("Repay my debt", context, { apiKey: "test", fetcher })).rejects.toThrow("account_id must match");
  });
});
