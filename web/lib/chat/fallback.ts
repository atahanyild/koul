/**
 * Koul without a model: the same reply contract, answered from the keyword parser and a few rules of thumb. Used
 * by the route when no parser key is configured, so the chat works everywhere the app runs.
 *
 * - A sentence that names a subject but no level asks for the level, with three quick replies around today's
 *   reading ("At what USD/TRY level? It is 48.79 now.").
 * - A bare number, or "make it 51", answers that question or changes the current draft.
 * - In editing mode, "make the lira exit 51" or "set rule 2 to 1.3" changes that rule in the list.
 * - Anything outside the router's vocabulary is unsupported, with what Koul can watch and do.
 */
import { newId, type Condition, type ConditionKind, type Rule } from "@/lib/model/autopilot";
import { actionShort } from "@/lib/model/labels";
import { parseSentence } from "@/lib/sentence";
import type { ChatReply, ChatMessage } from "./reducer";
import type { LiveContext } from "./schema";

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];

/** The router walks rules in order; protection first, then exits, then yield moves. New rules slot in by that order. */
const RANK: Record<ConditionKind, number> = { health_factor: 0, fx_price: 1, idle_usdc: 2, rate_gap: 3, pool_rate: 4 };
const insertionIndex = (rules: Rule[], rule: Rule): number => {
  const rank = RANK[rule.conditions[0]!.kind];
  const i = rules.findIndex((r) => RANK[r.conditions[0]!.kind] > rank);
  return i < 0 ? rules.length : i;
};

export const UNSUPPORTED = "Koul cannot do that. It can watch loan health, hub rates, USD/TRY and your wallet balance, and it can repay, move between hubs, supply or withdraw USDC.";

function subjectOf(c: Condition): string {
  switch (c.kind) {
    case "fx_price": return "USD/TRY";
    case "health_factor": return "health";
    case "rate_gap": return "rate gap";
    case "idle_usdc": return "wallet";
    case "pool_rate": return "hub APY";
  }
}

/** Three sensible levels around the reading, for the quick replies. */
function choicesFor(c: Condition, live: LiveContext): string[] {
  switch (c.kind) {
    case "fx_price": { const base = live.fx ? Math.ceil(live.fx) : 50; return [base, base + 1, base + 2].map(n2); }
    case "health_factor": return ["1.25", "1.50", "2.00"];
    case "rate_gap": return ["0.50", "1.00", "2.00"];
    case "idle_usdc": return ["50", "100", "500"];
    case "pool_rate": return ["2.00", "5.00", "10.00"];
  }
}

function readingFor(c: Condition, live: LiveContext): string | null {
  switch (c.kind) {
    case "fx_price": return live.fx ? `It is ${n2(live.fx)} now.` : null;
    case "health_factor": return live.hasLoan && live.healthFactor !== null ? `It is ${n2(live.healthFactor)} now.` : "You have no debt right now.";
    case "rate_gap": return live.rateA !== null && live.rateB !== null ? `The gap is ${n2(Math.abs(live.rateB - live.rateA))}% now.` : null;
    case "idle_usdc": return live.idleUsdc !== null ? `You have ${n2(live.idleUsdc)} USDC idle now.` : null;
    case "pool_rate": return null;
  }
}

const numberIn = (text: string): number | null => {
  const m = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

const withValue = (rule: Rule, value: number): Rule => ({ ...rule, conditions: rule.conditions.map((c, i) => (i === 0 ? { ...c, value } : c)), inferred: rule.inferred.filter((f) => f !== "conditions.0.value") });

function draftFor(rules: Rule[], rule: Rule, message?: string): ChatReply {
  const at = insertionIndex(rules, rule);
  const next = [...rules.slice(0, at), rule, ...rules.slice(at)];
  const after = next[at + 1];
  const where = at === next.length - 1 ? (next.length === 1 ? "It would be your only rule." : "It would run last.") : `It would run ${ORDINAL[at] ?? `${at + 1}th`}, before the ${subjectOf(after!.conditions[0]!).toLowerCase()} rule.`;
  return { kind: "draft", message: message ?? `Here is the rule. ${where}`, rules: next, position: at + 1 };
}

/** Which rule an editing sentence means: "rule 2", or the subject it names. */
function targetRule(text: string, rules: Rule[]): Rule | null {
  const byNumber = text.match(/\brule\s*(\d+)/i);
  if (byNumber) return rules[Number(byNumber[1]) - 1] ?? null;
  const lower = text.toLowerCase();
  const kind: ConditionKind | null = /lira|usd|try|dollar|kur|exit/.test(lower) ? "fx_price" : /health|liquidat|safe|debt|repay/.test(lower) ? "health_factor" : /gap|better|chase|best rate/.test(lower) ? "rate_gap" : /wallet|idle|sitting/.test(lower) ? "idle_usdc" : /apy|hub rate|pays/.test(lower) ? "pool_rate" : null;
  return kind ? rules.find((r) => r.conditions[0]?.kind === kind) ?? null : null;
}

export function answerLocally(messages: ChatMessage[], rules: Rule[], mode: "live" | "editing", live: LiveContext): ChatReply {
  const last = messages[messages.length - 1];
  const text = last?.role === "user" ? last.text.trim() : "";
  if (!text) return { kind: "unsupported", message: UNSUPPORTED };
  const prev = [...messages].reverse().find((m) => m.role === "koul");
  const value = numberIn(text);
  const onlyNumberOrMakeIt = value !== null && /^(?:make it|set it to|change it to|use)?\s*\d+(?:[.,]\d+)?\s*%?$/i.test(text);

  // Answering a question about a level.
  if (prev?.pending && value !== null && onlyNumberOrMakeIt) return draftFor(rules, withValue(prev.pending, value));
  // Adjusting the draft on the table.
  if (prev?.rules && prev.position && value !== null && onlyNumberOrMakeIt) {
    const idx = prev.position - 1;
    const next = prev.rules.map((r, i) => (i === idx ? withValue(r, value) : r));
    return { kind: "draft", message: `Changed it to ${n2(value)}.`, rules: next, position: prev.position };
  }
  // Editing an existing rule by sentence.
  if (mode === "editing" && value !== null && /make|set|change|move|update|to\b/.test(text.toLowerCase())) {
    const target = targetRule(text, rules);
    if (target) {
      const idx = rules.indexOf(target);
      const old = target.conditions[0]!.value;
      const next = rules.map((r, i) => (i === idx ? withValue(r, value) : r));
      return { kind: "draft", message: `Changed rule ${idx + 1} · ${n2(old)} → ${n2(value)}.`, rules: next, position: idx + 1 };
    }
  }
  // A new rule.
  const parsed = parseSentence(text);
  const rule = parsed.rules[0];
  if (!rule) return { kind: "unsupported", message: UNSUPPORTED };
  // The keyword parser defaults the wait to 5 s; a rule from the chat waits 10 minutes, or an hour for yield moves.
  const waits = rule.inferred.includes("cooldownSec") ? (rule.action.kind === "move_to_best_pool" || rule.action.kind === "supply_from_wallet" ? 3600 : 600) : rule.cooldownSec;
  const fresh: Rule = { ...rule, id: newId("chat"), cooldownSec: waits };
  if (fresh.inferred.includes("conditions.0.value")) {
    const c = fresh.conditions[0]!;
    const reading = readingFor(c, live);
    return { kind: "clarify", message: `At what ${subjectOf(c)} level?${reading ? ` ${reading}` : ""}`, choices: choicesFor(c, live), pending: fresh };
  }
  return draftFor(rules, fresh, parsed.unplaced.length ? `Here is the rule for the part Koul can do (${actionShort(fresh.action).toLowerCase()}); "${parsed.unplaced[0]}" is not something it can act on.` : undefined);
}
