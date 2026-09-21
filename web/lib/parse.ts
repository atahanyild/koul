/**
 * Sentence to rules for the new-autopilot page. Tries the Claude-backed route (`POST /api/autopilot/parse`) with the
 * live readings as context, and falls back to the deterministic keyword parser when the route is not configured
 * (503) or cannot be reached. Both paths return the same shape so the page does not care which one answered.
 */
import type { Autopilot as CoreAutopilot } from "@koul/core";
import { fromCoreAutopilot, newId, POOLS, type LiveValues, type Rule } from "@/lib/model/autopilot";
import { parseSentence } from "@/lib/sentence";
import { toUnits } from "@/lib/format";
import { tryPerUsdToUsdPerTry } from "@/lib/koul";

/** Mirrors `ParseContext` in packages/core/src/server.ts. Units follow the router: 7-decimal USDC, WAD, RAY, 14-decimal FX. */
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

/** What the route answers: the router's autopilot (or null when nothing was supported), plus notes for the rest. */
interface RouteResult {
  autopilot: CoreAutopilot | null;
  notes: string[];
  defaulted_fields: string[];
}

export type ParseSource = "koul" | "keywords";

export interface ParsedRules {
  rules: Rule[];
  /** Asks the parser could not place. */
  unplaced: string[];
  name: string;
  source: ParseSource;
  /** Why the fallback answered instead of the route, when it was not a plain 503. */
  fallbackReason: string | null;
}

export const HUB_IDS = [POOLS.A.hub, POOLS.B.hub];

/** Percent (1.35) to RAY (1e27): rate / 100 * 1e27 = rate * 1e25, kept exact through BigInt. */
const percentToRay = (percent: number): string => (BigInt(Math.round(percent * 1e7)) * 10n ** 18n).toString();

export function buildParseContext(live: LiveValues, accountId: string, fxAgeSec: number | null): ParseContext {
  const rates: Record<string, string> = {};
  if (live.rateA !== null) rates[String(POOLS.A.hub)] = percentToRay(live.rateA);
  if (live.rateB !== null) rates[String(POOLS.B.hub)] = percentToRay(live.rateB);
  return {
    accountId,
    hubIds: HUB_IDS,
    idleUsdc: toUnits(live.idleUsdc ?? 0).toString(),
    healthFactorWad: live.hasLoan && live.healthFactor !== null ? BigInt(Math.round(live.healthFactor * 1e6)).toString() + "000000000000" : null,
    depositRatesRay: rates,
    fxAsset: "TRY",
    fxPrice: live.fx !== null && live.fx > 0 ? tryPerUsdToUsdPerTry(live.fx).toString() : null,
    fxPriceAgeSeconds: live.fx !== null && live.fx > 0 ? fxAgeSec : null,
  };
}

/** True when the text states any wait or interval, so a cooldown the model set can be treated as the user's. */
const DURATION = /\b(?:\d+(?:[.,]\d+)?\s*|(?:an?|one|bir)\s+)(?:hour|hours|h|day|days|d|minute|minutes|min|saat|gün|dakika)\b|once a day|daily|hourly|once an hour|günde bir|saatte bir/i;
export const hasDuration = (text: string): boolean => DURATION.test(text);

const nameFor = (rules: Rule[]): string => (rules.length === 3 ? "Lira shield" : rules.length === 1 ? rules[0]!.name : rules.length ? "My autopilot" : "Untitled autopilot");

function fromKeywords(text: string, reason: string | null): ParsedRules {
  const r = parseSentence(text);
  return { rules: r.rules, unplaced: r.unplaced, name: r.name, source: "keywords", fallbackReason: reason };
}

function fromRoute(text: string, result: RouteResult): ParsedRules {
  const cooldownInferred = !hasDuration(text) || result.defaulted_fields.some((f) => f.includes("cooldown"));
  const rules = result.autopilot
    ? fromCoreAutopilot(result.autopilot).map<Rule>((r) => ({ ...r, id: newId(), inferred: cooldownInferred ? [...r.inferred, "cooldownSec"] : r.inferred }))
    : [];
  return { rules, unplaced: result.notes, name: nameFor(rules), source: "koul", fallbackReason: null };
}

/**
 * Ask the route, fall back to keywords. A 503 (no API key) and a network failure fall back silently; any other
 * error falls back too but carries the reason so the page can say why the answer is keyword-matched.
 */
export async function parseWithKoul(text: string, context: ParseContext, signal?: AbortSignal): Promise<ParsedRules> {
  let response: Response;
  try {
    response = await fetch("/api/autopilot/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, context }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return fromKeywords(text, null);
  }
  if (response.status === 503) return fromKeywords(text, null);
  if (!response.ok) {
    let reason = `Koul's parser answered ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") reason = body.error;
    } catch {
      // keep the status text
    }
    return fromKeywords(text, reason);
  }
  try {
    const body = (await response.json()) as RouteResult;
    return fromRoute(text, body);
  } catch {
    return fromKeywords(text, "Koul's parser sent an answer this page could not read");
  }
}
