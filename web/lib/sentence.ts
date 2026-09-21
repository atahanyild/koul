/**
 * Sentence to rules. A deterministic parser over the router's vocabulary: it only produces conditions and actions
 * the router can check and do, fills gaps with defaults it marks as inferred, and reports anything it could not
 * place instead of inventing. A Claude-backed route can replace `parseSentence` with the same return shape.
 */
import { makeRule, RULE_DEFAULTS, type ConditionKind, type Rule } from "@/lib/model/autopilot";

export interface ParseResult {
  rules: Rule[];
  /** Phrases the router cannot act on, e.g. "buy gold". */
  unplaced: string[];
  /** A suggested name for the autopilot. */
  name: string;
}

const num = (s: string, re: RegExp): number | null => {
  const m = s.match(re);
  return m ? Number(m[1].replace(",", ".")) : null;
};

const UNIT = "(hour|hours|h\\b|day|days|d\\b|minute|minutes|min\\b|saat|gün|dakika)";
const cooldownFrom = (s: string): number | null => {
  const m =
    s.match(new RegExp(`(?:wait|cool ?down|every|once (?:a|per)|bekle|her)\\s*(?:for\\s*)?(\\d+(?:[.,]\\d+)?|an?|one|bir)?\\s*${UNIT}`, "i")) ??
    s.match(new RegExp(`(\\d+(?:[.,]\\d+)?|an?|one|bir)\\s*${UNIT}\\s*(?:wait|cooldown|between|bekle|ara)`, "i"));
  if (!m) return s.match(/once a day|daily|günde bir/i) ? 86400 : s.match(/once an hour|hourly|saatte bir/i) ? 3600 : null;
  const raw = m[1] ?? "1";
  const n = /^(an?|one|bir)$/i.test(raw) ? 1 : Number(raw.replace(",", "."));
  const u = m[2].toLowerCase();
  return u.startsWith("d") && !u.startsWith("dak") ? n * 86400 : u.startsWith("g") ? n * 86400 : u.startsWith("h") || u.startsWith("s") ? n * 3600 : n * 60;
};

export function parseSentence(input: string): ParseResult {
  const text = input.trim();
  const lower = text.toLowerCase();
  // Split into clauses so each rule gets its own wait, if stated.
  // Split on sentence ends (a period followed by space or end, never a decimal point), semicolons, and clause joins.
  const clauses = lower.split(/\.(?=\s|$)|;|\b(?:and|ve|ama)\b(?=\s+(?:if|when|whenever|never|always|keep|move|repay|pull|withdraw|exit|eğer|dolar|kur|lira|faiz|borç))|,\s*(?=(?:but|and|if|when|eğer|ama|ve)\b)/).map((c) => c.trim()).filter(Boolean);
  const rules: Rule[] = [];
  const unplaced: string[] = [];
  const has = (kind: string) => rules.some((r) => r.conditions[0]?.kind === kind);

  for (const c of clauses) {
    let placed = false;
    // Health guard
    if (/health|liquidat|collateral|loan|debt|repay|safe|sağlık|borç|tasfiye|likidasyon|güvende/.test(c) && !has("health_factor")) {
      const v = num(c, /(?:under|below|less than|drops? (?:to|under|below)|<)\s*(\d+(?:[.,]\d+)?)/) ?? num(c, /(\d+[.,]\d+)(?:'?[ıi]n)?\s*(?:altına|altında)/) ?? num(c, /(\d+[.,]\d+)/);
      const cd = cooldownFrom(c);
      const inferred: string[] = [];
      if (v === null) inferred.push("conditions.0.value");
      if (cd === null) inferred.push("cooldownSec");
      rules.push(makeRule({ name: "Stay safe", conditions: [{ kind: "health_factor", comparator: "lte", value: v ?? RULE_DEFAULTS.health_factor.value }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: cd ?? RULE_DEFAULTS.health_factor.cooldownSec, inferred }));
      placed = true;
    }
    // Rate chase
    if (/pays? more|better rate|higher (?:rate|yield|apy)|best (?:rate|yield|pool)|whichever|wherever|earns? more|more interest|chase|yield|faiz|getiri|daha (?:çok|fazla) (?:öde|kazan)|hangi havuz/.test(c) && !has("rate_gap")) {
      const v = num(c, /(\d+(?:[.,]\d+)?)\s*(?:%|percent|pts?|points?|bps)/) ?? (/half a (?:point|percent)/.test(c) ? 0.5 : null);
      const bps = /(\d+)\s*bps/.exec(c);
      const value = bps ? Number(bps[1]) / 100 : v;
      const cd = cooldownFrom(c);
      const inferred: string[] = [];
      if (value === null) inferred.push("conditions.0.value");
      if (cd === null) inferred.push("cooldownSec");
      rules.push(makeRule({ name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: value ?? RULE_DEFAULTS.rate_gap.value }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: cd ?? RULE_DEFAULTS.rate_gap.cooldownSec, inferred }));
      placed = true;
    }
    // FX exit
    // "the lira drops" is USD/TRY rising, the same exit.
    if (/lira|try\b|usd\/try|dollar|dolar|kur|exchange rate|fx/.test(c) && /pass|cross|above|over|reach|hits?|goes? past|exceeds?|>=|>|drops?|falls?|weakens?|slides?|crash|geç|aş|üst|üzer|düş/.test(c) && !has("fx_price")) {
      const v = num(c, /(?:pass(?:es)?|cross(?:es)?|above|over|reach(?:es)?|hits?|past|exceeds?|>=?)\s*(\d+(?:[.,]\d+)?)/) ?? num(c, /(\d+(?:[.,]\d+)?)(?:'?[yiıu]?[ıiuü])?\s*(?:geç|aş|üst|üzer)/) ?? num(c, /(\d{2}(?:[.,]\d+)?)/);
      const cd = cooldownFrom(c);
      const inferred: string[] = [];
      if (v === null) inferred.push("conditions.0.value");
      if (cd === null) inferred.push("cooldownSec");
      rules.push(makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: v ?? RULE_DEFAULTS.fx_price.value }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: cd ?? RULE_DEFAULTS.fx_price.cooldownSec, inferred }));
      placed = true;
    }
    if (!placed && c.length > 3 && !/^(then|and|but|also|please|ok|ve|ama)$/.test(c)) unplaced.push(c);
  }

  // The router evaluates health, then rates, then FX. Keep that order so the adapter maps one to one.
  const order: Record<ConditionKind, number> = { health_factor: 0, pool_rate: 1, rate_gap: 2, fx_price: 3, idle_usdc: 4 };
  rules.sort((a, b) => order[a.conditions[0].kind] - order[b.conditions[0].kind]);

  const name = rules.length === 3 ? "Lira shield" : rules.length === 1 ? rules[0].name : rules.length ? "My autopilot" : "Untitled autopilot";
  return { rules, unplaced, name };
}
