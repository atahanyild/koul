/**
 * Live check of the sentence parser. Needs ANTHROPIC_API_KEY in the environment or in web/.env.local:
 *   cd packages/core && pnpm parse-test
 * It sends a few sentences, including one the router cannot do, and prints the rules that come back.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseAutopilot, parserSettings, type ParseContext } from "../src/server";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
// The key and the model live in web/.env.local, the same file the route reads.
try {
  for (const line of readFileSync(`${ROOT}web/.env.local`, "utf8").split("\n")) {
    const m = line.match(/^(ANTHROPIC_API_KEY|ANTHROPIC_MODEL|OPENAI_API_KEY|OPENAI_MODEL|OPENAI_BASE_URL|KOUL_PARSER)=(.+)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim();
  }
} catch { /* no file */ }
const settings = parserSettings();
if (!settings.apiKey) {
  console.error("No parser key. Put one in web/.env.local:\n  ANTHROPIC_API_KEY=sk-ant-...\nor\n  OPENAI_API_KEY=sk-...\n  OPENAI_MODEL=gpt-4o-mini");
  process.exit(1);
}
console.log(`provider ${settings.provider} · model ${settings.model}${settings.provider === "openai" ? ` · ${settings.baseUrl}` : ""}`);

/** The readings the app passes: this is the live testnet picture. */
const context: ParseContext = {
  accountId: "12",
  hubIds: [1, 2],
  idleUsdc: "208199972",
  healthFactorWad: null,
  depositRatesRay: { "1": "13500000000000000000000000", "2": "821000000000000000000000000" },
  fxAsset: "TRY",
  fxPrice: "2049600327936",
  fxPriceAgeSeconds: 120,
};

const SENTENCES = [
  "Whenever I have at least 10 USDC sitting in my wallet, put it into the pool that pays more.",
  "Keep my USDC where it earns most, never let my loan health drop under 1.25, and if the lira passes 50 pull everything back to my wallet and wait a day.",
  "If the secondary pool pays more than 60% a year, move everything there, but only once an hour.",
  "Buy me gold when bitcoin dips.",
];

for (const text of SENTENCES) {
  console.log(`\n--- ${text}`);
  const started = Date.now();
  try {
    const result = await parseAutopilot(text, context);
    console.log(`    ${((Date.now() - started) / 1000).toFixed(1)}s`);
    if (!result.autopilot) console.log("    no autopilot (the router cannot do this)");
    else for (const [i, rule] of result.autopilot.rules.entries()) {
      const conditions = rule.conditions.map((c) => JSON.stringify(c)).join(rule.match_all ? " AND " : " OR ");
      console.log(`    rule ${i}: ${conditions} -> ${JSON.stringify(rule.action)} wait ${rule.cooldown_ledgers} ledgers`);
    }
    if (result.notes.length) console.log(`    notes: ${result.notes.join(" | ")}`);
    if (result.defaulted_fields.length) console.log(`    filled in: ${result.defaulted_fields.join(", ")}`);
  } catch (err) {
    console.log(`    FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
