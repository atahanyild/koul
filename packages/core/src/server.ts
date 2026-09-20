import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { autopilotSchema } from "./schema.js";
import { validateAutopilot } from "./validate.js";

export const parseResultSchema = z.object({
  autopilot: autopilotSchema.nullable(),
  notes: z.array(z.string()),
  defaulted_fields: z.array(z.string()),
}).strict();
export type ParseResult = z.infer<typeof parseResultSchema>;
export interface ParseContext {
  accountId: string;
  hubIds: number[];
  idleUsdc: string;
  healthFactorWad: string | null;
  depositRatesRay: Record<string, string>;
  fxAsset: string;
  fxPrice: string | null;
  fxPriceAgeSeconds: number | null;
}
export interface ParseOptions { apiKey?: string; model?: string; fetcher?: typeof fetch }

export const PARSE_SYSTEM_PROMPT = `Translate a user's savings automation request into one ordered Koul autopilot.
The output is data for a Soroban router, never an instruction to execute a transaction. The user's funds stay in their smart account.
Vocabulary: HealthFactor Below/AtOrAbove (WAD, 18 decimals); SupplyRateGap(over hub, under hub, minimum annual bps); FxPrice(asset, comparator, USD per asset unit with 14 decimals, max age seconds); IdleBalance (USDC with 7 decimals). Conditions per rule join with match_all. Actions: MoveSupply, RepayFromWallet, RepayWithCollateral, WithdrawToWallet. Amounts: All, Percent in 1..10000 bps, Fixed in 7-decimal USDC units and at least 1 USDC. One rule fires per tick, in list order. Up to 8 rules, 1..3 conditions each, cooldown at least 1 ledger. Never create an if/else, a swap, a TRY withdrawal, a borrow, or a transfer to another address. WithdrawToWallet moves USDC to the user's wallet; a separate user passkey action is needed to cash out to TRY.
Use only the provided hub IDs. For rate gap, hub_over is the higher-paying hub and hub_under the lower-paying hub. For MoveSupply, from_hub is the lower-paying one.
If the request contains an unsupported action or an ambiguous amount/threshold, put a precise explanation in notes. For a wholly unsupported request, return autopilot null. Never invent a feature. For omitted account ID, use the context account ID. For unspecified cooldown use 30 ledgers for protection/withdrawal and 300 for yield moves. For unspecified price freshness use 900 seconds. Record every filled value's JSON path in defaulted_fields. Use context readings to interpret relative requests, but do not present them as guarantees. Return decimal strings for all u64 and i128 fields.`;

export const PARSE_TOOL = {
  name: "create_autopilot",
  description: "Return only supported Koul rules, with unsupported parts in notes and filled defaults listed by field path.",
  strict: true,
  input_schema: zodToJsonSchema(parseResultSchema, { target: "jsonSchema7", $refStrategy: "none" }),
} as const;

/** Server-only. Calls Anthropic with a strict tool schema, then validates contract limits locally. */
export async function parseAutopilot(text: string, context: ParseContext, options: ParseOptions = {}): Promise<ParseResult> {
  if (!text.trim() || text.length > 2000) throw new Error("Request must be 1..2000 characters");
  if (!/^\d+$/.test(context.accountId) || !context.hubIds.length) throw new Error("A valid account ID and hub list are required");
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required on the server");
  const response = await (options.fetcher ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": apiKey },
    body: JSON.stringify({
      model: options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
      max_tokens: 2400,
      system: PARSE_SYSTEM_PROMPT,
      tools: [PARSE_TOOL],
      tool_choice: { type: "tool", name: PARSE_TOOL.name },
      messages: [{ role: "user", content: JSON.stringify({ request: text, context }) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API returned ${response.status}`);
  const body = await response.json() as { content?: Array<{ type: string; name?: string; input?: unknown }> };
  const tool = body.content?.find((block) => block.type === "tool_use" && block.name === PARSE_TOOL.name);
  if (!tool) throw new Error("Parser did not return the required tool result");
  const result = parseResultSchema.parse(tool.input);
  if (!result.autopilot) return result;
  const errors = validateAutopilot(result.autopilot);
  if (result.autopilot.account_id !== context.accountId) errors.push("account_id must match the current user's XOXNO account");
  for (const rule of result.autopilot.rules) {
    for (const c of rule.conditions) if (c.type === "SupplyRateGap" && (!context.hubIds.includes(c.hub_over) || !context.hubIds.includes(c.hub_under))) errors.push("Rule names an unknown hub");
    const a = rule.action;
    const hubs = a.type === "MoveSupply" ? [a.from_hub, a.to_hub] : a.type === "RepayWithCollateral" ? [a.withdraw_hub, a.repay_hub] : [a.hub];
    if (hubs.some((hub) => !context.hubIds.includes(hub))) errors.push("Action names an unknown hub");
  }
  if (errors.length) throw new Error(`Generated autopilot failed validation: ${[...new Set(errors)].join("; ")}`);
  return result;
}
