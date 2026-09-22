/**
 * The Autopilot chat. Takes the conversation, the current rules, the mode and the live readings; answers with one
 * strict JSON reply: a draft (the whole list with the new or changed rule's position), one clarifying question with
 * quick replies, or unsupported. A model answers when a parser key is configured; the local keyword answerer
 * otherwise. Whatever answers is checked against the schema and the router's pairing rules, and a bad answer is a
 * 502 that the page shows as an error with Retry. The key never leaves this process.
 */
import { parserSettings } from "@koul/core/server";
import { answerLocally } from "@/lib/chat/fallback";
import { chatReplySchema, chatRequestSchema, type ChatRequest, type ChatReplyWire } from "@/lib/chat/schema";
import type { Rule } from "@/lib/model/autopilot";
import { pairingProblem } from "@/lib/model/pairing";

export const runtime = "nodejs";

const SYSTEM = `You are Koul, a savings autopilot on Stellar. Turn what the user says into rules the router can run, in a short conversation, and answer with exactly one call of the "reply" tool.
Vocabulary. Conditions (kind, comparator "gte" or "lte", value): "fx_price" USD/TRY as people say it (48.79); "health_factor" loan health (liquidation at 1.00); "rate_gap" the difference between the two hubs' rates in percent points, only "gte"; "idle_usdc" USDC sitting in the wallet; "pool_rate" one hub's APY percent with "pool" "A" (hub 1) or "B" (hub 2). Actions (kind, amount "all" or a USDC number): "withdraw_to_wallet", "repay_from_wallet", "move_to_best_pool" (only with a rate_gap condition, and rate_gap only with it), "supply_from_wallet" with "pool". One to three conditions per rule ("match" "all" or "any"), "cooldownSec" the wait between runs (600 for exits and repayments, 3600 for yield moves unless the user says otherwise), "inferred" the field paths you filled in, "enabled" true. Never invent anything outside this list: no swaps, borrows, TRY payouts, transfers to other addresses, schedules by date.
Replies. "draft": the complete rule list to save, existing rules unchanged with their ids, the new or changed rule inserted where it should run (protection first, then exits, then yield moves; the router runs the first matching rule) and "position" its 1-based index; "message" one sentence, for a new rule say where it would run ("It would run second, before the rate rule."), for a change say what changed ("Changed rule 2 · 50.00 → 51.00"). "clarify": when one level is missing and you cannot infer it, ask one short question quoting today's reading and give two to four "choices" (numbers as strings) and the "pending" rule with a placeholder value. "unsupported": one sentence saying Koul cannot do that and what it can watch and do; do not guess.
Follow-ups: a bare number or "make it 51" changes the level of the draft on the table (the last koul message carries "rules" and "position") or answers the pending question. In "editing" mode a sentence like "make the lira exit 51" changes that rule in the given list. Keep messages under 160 characters. New rule ids: "chat_<n>".`;

const REPLY_TOOL = {
  name: "reply",
  description: "The one reply to the user: a draft rule list, a clarifying question, or unsupported.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "message"],
    properties: {
      kind: { type: "string", enum: ["draft", "clarify", "unsupported"] },
      message: { type: "string" },
      rules: { type: "array", maxItems: 8, items: {
        type: "object", additionalProperties: false, required: ["id", "name", "conditions", "match", "action", "cooldownSec", "inferred", "enabled"],
        properties: {
          id: { type: "string" }, name: { type: "string" },
          conditions: { type: "array", minItems: 1, maxItems: 3, items: { type: "object", additionalProperties: false, required: ["kind", "comparator", "value"], properties: { kind: { type: "string", enum: ["fx_price", "health_factor", "rate_gap", "idle_usdc", "pool_rate"] }, comparator: { type: "string", enum: ["gte", "lte"] }, value: { type: "number" }, pool: { type: "string", enum: ["A", "B"] } } } },
          match: { type: "string", enum: ["all", "any"] },
          action: { type: "object", additionalProperties: false, required: ["kind", "amount"], properties: { kind: { type: "string", enum: ["withdraw_to_wallet", "repay_from_wallet", "move_to_best_pool", "supply_from_wallet"] }, amount: { oneOf: [{ type: "string", enum: ["all"] }, { type: "number" }] }, pool: { type: "string", enum: ["A", "B"] } } },
          cooldownSec: { type: "integer" }, inferred: { type: "array", items: { type: "string" } }, enabled: { type: "boolean" },
        },
      } },
      position: { type: "integer" },
      choices: { type: "array", maxItems: 4, items: { type: "string" } },
      pending: { type: "object" },
    },
  },
} as const;

async function askModel(req: ChatRequest): Promise<unknown> {
  const { provider, apiKey, model, baseUrl } = parserSettings();
  const user = JSON.stringify({ mode: req.mode, live: req.live, rules: req.rules, conversation: req.messages });
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": apiKey },
      body: JSON.stringify({ model, max_tokens: 2000, system: SYSTEM, tools: [REPLY_TOOL], tool_choice: { type: "tool", name: REPLY_TOOL.name }, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) throw new Error(`The model answered ${res.status}`);
    const body = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
    const tool = body.content?.find((b) => b.type === "tool_use" && b.name === REPLY_TOOL.name);
    if (!tool) throw new Error("The model did not reply with the tool");
    return tool.input;
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], tools: [{ type: "function", function: { name: REPLY_TOOL.name, description: REPLY_TOOL.description, parameters: REPLY_TOOL.input_schema } }], tool_choice: { type: "function", function: { name: REPLY_TOOL.name } } }),
  });
  if (!res.ok) throw new Error(`The model answered ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }> };
  const call = body.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name === REPLY_TOOL.name);
  if (!call?.function?.arguments) throw new Error("The model did not reply with the tool");
  return JSON.parse(call.function.arguments) as unknown;
}

/** Everything a reply must satisfy beyond its shape: the router's pairings, and existing rules kept as they were. */
function checkReply(reply: ChatReplyWire, req: ChatRequest): string | null {
  for (const r of [...(reply.rules ?? []), ...(reply.pending ? [reply.pending] : [])]) {
    const problem = pairingProblem(r as Rule);
    if (problem) return problem;
  }
  if (reply.kind === "draft" && reply.rules) {
    const known = new Map(req.rules.map((r) => [r.id, r]));
    const changed = reply.rules.filter((r) => known.has(r.id) && JSON.stringify(known.get(r.id)) !== JSON.stringify(r)).length;
    if (req.mode === "live" && changed > 0) return "The draft changed a saved rule; only editing mode may do that";
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try { raw = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = chatRequestSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "The request does not match the chat contract" }, { status: 400 });
  const req = parsed.data;
  const { apiKey } = parserSettings();
  let answer: unknown;
  try {
    answer = apiKey ? await askModel(req) : answerLocally(req.messages, req.rules as Rule[], req.mode, req.live);
  } catch (err) {
    console.error("Autopilot chat failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Koul could not answer right now" }, { status: 502 });
  }
  const reply = chatReplySchema.safeParse(answer);
  if (!reply.success) {
    console.error("Autopilot chat: reply off contract:", reply.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    return Response.json({ error: "Koul's answer did not match what the page expects" }, { status: 502 });
  }
  const problem = checkReply(reply.data, req);
  if (problem) return Response.json({ error: problem }, { status: 502 });
  return Response.json(reply.data);
}
