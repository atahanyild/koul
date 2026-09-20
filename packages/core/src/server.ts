import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { autopilotSchema } from "./schema";
import { validateAutopilot } from "./validate";

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
export const PARSE_SYSTEM_PROMPT = `Translate a user's savings automation request into one ordered Koul autopilot.
The output is data for a Soroban router, never an instruction to execute a transaction. The user's funds stay in their smart account.
Vocabulary: HealthFactor Below/AtOrAbove (WAD, 18 decimals); SupplyRateGap(over hub, under hub, minimum annual bps); SupplyRate(hub, comparator, annual bps) for what one hub pays on its own; FxPrice(asset, comparator, USD per asset unit with 14 decimals, max age seconds); IdleBalance (USDC with 7 decimals). Conditions per rule join with match_all. Actions: SupplyFromWallet to put idle wallet USDC into a hub, which is the only way an autopilot opens a position; MoveSupply; RepayFromWallet; RepayWithCollateral; WithdrawToWallet. Amounts: All, Percent in 1..10000 bps, Fixed in 7-decimal USDC units and at least 1 USDC. One rule fires per tick, in list order. Up to 8 rules, 1..3 conditions each, cooldown at least 1 ledger. Never create an if/else, a swap, a TRY withdrawal, a borrow, or a transfer to another address. WithdrawToWallet moves USDC to the user's wallet; a separate user passkey action is needed to cash out to TRY.
The FX oracle quotes USD per one unit of the asset with 14 decimals, which is the inverse of the USD/TRY rate people say out loud. A user who says "if the lira passes 50" or "USD/TRY above 50" means one dollar buys 50 lira or more, which is FxPrice(TRY, Below, round(1e14 / 50) = "2000000000000"). A stronger lira, "USD/TRY under 45", is FxPrice(TRY, AtOrAbove, round(1e14 / 45)). Always divide 1e14 by the rate the user said, and pick Below for a weakening lira and AtOrAbove for a strengthening one. Sanity check the level against the context price before returning it.
Use only the provided hub IDs. For rate gap, hub_over is the higher-paying hub and hub_under the lower-paying hub. For MoveSupply, from_hub is the lower-paying one. Rates everywhere are the pool's simple annual rate, which the context gives in RAY (1e27 = 100%); a user speaking of a compounded APY p means bps = round(ln(1 + p) * 10000). When a request says to put idle money to work without naming a hub, use the hub the context shows paying most.
If the request contains an unsupported action or an ambiguous amount/threshold, put a precise explanation in notes. For a wholly unsupported request, return autopilot null. Never invent a feature. For omitted account ID, use the context account ID. For unspecified cooldown use 30 ledgers for protection/withdrawal and 300 for yield moves. For unspecified price freshness use 900 seconds. Record every filled value's JSON path in defaulted_fields. Use context readings to interpret relative requests, but do not present them as guarantees. Return decimal strings for all u64 and i128 fields.`;

/**
 * The tool the model must call. The schema is generated from the same zod schema the codec uses, so the model is
 * shown the contract's own shape. It is sent without a provider's "strict" flag: Anthropic's strict subset rejects
 * `maxItems`, and the rule and condition counts are worth showing the model. Whatever comes back is parsed by zod
 * and then checked against the contract's limits, so nothing invalid can reach a signature either way.
 */
export const PARSE_TOOL = {
  name: "create_autopilot",
  description: "Return only supported Koul rules, with unsupported parts in notes and filled defaults listed by field path.",
  input_schema: zodToJsonSchema(parseResultSchema, { target: "jsonSchema7", $refStrategy: "none" }),
} as const;

export interface ParseOptions {
  apiKey?: string;
  model?: string;
  /** "anthropic", or "openai" for anything speaking the OpenAI chat-completions API. */
  provider?: Provider;
  /** For OpenAI-compatible providers: where to send it. Defaults to OpenAI itself. */
  baseUrl?: string;
  fetcher?: typeof fetch;
}
export type Provider = "anthropic" | "openai";

/** Models sometimes wrap the tool result in another copy of the top-level key. Take the inner object when they do. */
function unwrap(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const outer = raw as Record<string, unknown>;
  const inner = outer.autopilot;
  if (inner && typeof inner === "object" && "autopilot" in (inner as Record<string, unknown>) && "notes" in (inner as Record<string, unknown>)) return inner;
  return raw;
}

/**
 * Which provider to use, and with what. Anthropic wins when both keys are present; `KOUL_PARSER` overrides.
 * Any OpenAI-compatible endpoint works through the "openai" path: OpenAI itself, a gateway, or a local server
 * such as Ollama (`OPENAI_BASE_URL=http://localhost:11434/v1`).
 */
export function parserSettings(options: ParseOptions = {}): { provider: Provider; apiKey: string; model: string; baseUrl: string } {
  const forced = options.provider ?? (process.env.KOUL_PARSER as Provider | undefined);
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const provider: Provider = forced ?? (anthropicKey ? "anthropic" : openaiKey ? "openai" : "anthropic");
  const apiKey = options.apiKey ?? (provider === "anthropic" ? anthropicKey : openaiKey) ?? "";
  const model = options.model ?? (provider === "anthropic" ? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5" : process.env.OPENAI_MODEL ?? "gpt-4o-mini");
  const baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  return { provider, apiKey, model, baseUrl };
}

/** Server-only. Asks the model for one strict tool call, then validates it against the contract's own limits. */
export async function parseAutopilot(text: string, context: ParseContext, options: ParseOptions = {}): Promise<ParseResult> {
  if (!text.trim() || text.length > 2000) throw new Error("Request must be 1..2000 characters");
  if (!/^\d+$/.test(context.accountId) || !context.hubIds.length) throw new Error("A valid account ID and hub list are required");
  const { provider, apiKey, model, baseUrl } = parserSettings(options);
  if (!apiKey) throw new Error("No parser API key on the server: set ANTHROPIC_API_KEY or OPENAI_API_KEY");
  const fetcher = options.fetcher ?? fetch;
  const message = JSON.stringify({ request: text, context });

  let raw: unknown;
  let attempt = 0;
  if (provider === "anthropic") {
    const response = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": apiKey },
      body: JSON.stringify({
        model,
        max_tokens: 2400,
        system: PARSE_SYSTEM_PROMPT,
        tools: [PARSE_TOOL],
        tool_choice: { type: "tool", name: PARSE_TOOL.name },
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API returned ${response.status}: ${(await response.text()).slice(0, 400)}`);
    const body = await response.json() as { content?: Array<{ type: string; name?: string; input?: unknown }> };
    const tool = body.content?.find((block) => block.type === "tool_use" && block.name === PARSE_TOOL.name);
    if (!tool) throw new Error("Parser did not return the required tool result");
    raw = tool.input;
  } else {
    const response = await fetcher(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: PARSE_SYSTEM_PROMPT }, { role: "user", content: message }],
        tools: [{ type: "function", function: { name: PARSE_TOOL.name, description: PARSE_TOOL.description, parameters: PARSE_TOOL.input_schema } }],
        tool_choice: { type: "function", function: { name: PARSE_TOOL.name } },
      }),
    });
    if (!response.ok) throw new Error(`Parser API returned ${response.status}: ${(await response.text()).slice(0, 400)}`);
    const body = await response.json() as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }> };
    const call = body.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === PARSE_TOOL.name);
    if (!call?.function?.arguments) throw new Error("Parser did not return the required tool result");
    try { raw = JSON.parse(call.function.arguments); } catch { throw new Error("Parser returned arguments that are not JSON"); }
  }
  const parsed = parseResultSchema.safeParse(unwrap(raw));
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Error(`Parser returned a result that does not match the schema (${where}). Got: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  const result = parsed.data;
  void attempt;
  if (!result.autopilot) return result;
  const errors = validateAutopilot(result.autopilot);
  if (result.autopilot.account_id !== context.accountId) errors.push("account_id must match the current user's XOXNO account");
  for (const rule of result.autopilot.rules) {
    for (const c of rule.conditions) {
      if (c.type === "SupplyRateGap" && (!context.hubIds.includes(c.hub_over) || !context.hubIds.includes(c.hub_under))) errors.push("Rule names an unknown hub");
      if (c.type === "SupplyRate" && !context.hubIds.includes(c.hub)) errors.push("Rule names an unknown hub");
    }
    const a = rule.action;
    const hubs = a.type === "MoveSupply" ? [a.from_hub, a.to_hub] : a.type === "RepayWithCollateral" ? [a.withdraw_hub, a.repay_hub] : [a.hub];
    if (hubs.some((hub) => !context.hubIds.includes(hub))) errors.push("Action names an unknown hub");
  }
  if (errors.length) throw new Error(`Generated autopilot failed validation: ${[...new Set(errors)].join("; ")}`);
  return result;
}
