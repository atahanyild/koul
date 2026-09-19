/**
 * Anchor discovery, server-side. Everything comes from the anchor's
 * stellar.toml (SEP-1): the asset issuer, the SEP-10/6/12/38 endpoints and the
 * signing key. The only configuration is the list of home domains and the
 * asset code; the presenter picks the active anchor at runtime (/booth/admin),
 * and every in-flight record remembers the home domain it started on.
 */
import { Asset } from "@stellar/stellar-sdk";

/**
 * Ported from Kumbara (github.com/keyboord01/kumbara, MIT, Sembol 2026) with
 * the Next.js data cache and the presenter's KV-backed anchor switch removed.
 * Niet configures the anchor with two environment variables only.
 */
const networkPassphrase = (): string => process.env.NETWORK_PASSPHRASE?.trim() || "Test SDF Network ; September 2015";
const serverEnv = {
  anchorHomeDomains: (): string[] => (process.env.ANCHOR_HOME_DOMAINS ?? "tr-mock-anchor.fly.dev").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
  anchorAssetCode: (): string => process.env.ANCHOR_ASSET_CODE?.trim() || "USDC",
};

export interface AnchorLimits {
  /** SEP-6 /info: per-request minimum and maximum in units of the on-chain asset (deposit-exchange when the anchor offers it, else deposit). */
  deposit: { min: number | null; max: number | null };
  /** SEP-6 /info withdraw limits in the asset; raised to the anchor's published off-ramp minimum when it states one. */
  withdraw: { min: number | null; max: number | null };
  /**
   * Per-deposit limits in the anchor's fiat: as published by the anchor when it states them (the TR Mock Anchor does, on its
   * status page), else derived from the SEP-6 asset limits at the anchor's own SEP-38 price; null when neither exists.
   */
  fiat: { min: number | null; max: number | null; source: "anchor" | "derived" } | null;
}

export interface AnchorDiscovery {
  /** The stellar.toml host, e.g. tr-mock-anchor.fly.dev. */
  homeDomain: string;
  /** Kept for the client: `usdc` is the anchored asset even when ANCHOR_ASSET_CODE differs. */
  usdc: { code: string; issuer: string; contractId: string };
  endpoints: Record<string, string>;
  networkPassphrase: string;
  orgName: string | null;
  /** ISO 4217 code the anchor ramps against (stellar.toml `anchor_asset`, else the first fiat asset in SEP-38 /info). */
  fiatCode: string | null;
  /** SEP-38 delivery method names for that fiat (what a firm quote must name); SEP-6 `type` is a separate list. */
  sep38: { sellDeliveryMethods: string[]; buyDeliveryMethods: string[] } | null;
  /** SEP-6 /info for the asset: limits, funding methods and whether exchange endpoints exist. */
  sep6: { deposit: Sep6AssetInfo | null; withdraw: Sep6AssetInfo | null; depositExchange: boolean; withdrawExchange: boolean } | null;
  limits: AnchorLimits;
  /** The account the anchor pays on-ramps from, with its asset balance, when the anchor publishes a status page next to its SEP endpoints. */
  treasury: { address: string; balance: string | null; low: boolean } | null;
  fetchedAt: number;
}

export interface Sep6AssetInfo {
  enabled: boolean;
  minAmount?: number;
  maxAmount?: number;
  feePercent?: number;
  fundingMethods: string[];
}

/** Configured home domains; the first is the default. */
export function configuredAnchors(): string[] {
  return serverEnv.anchorHomeDomains();
}

/** The first configured home domain. */
export async function activeAnchorHomeDomain(): Promise<string> {
  const configured = configuredAnchors();
  if (configured.length === 0) throw new Error("no anchor configured: set ANCHOR_HOME_DOMAINS");
  return configured[0]!;
}

function parseSep6Asset(entry: unknown): Sep6AssetInfo | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const out: Sep6AssetInfo = { enabled: e.enabled === true, fundingMethods: Array.isArray(e.funding_methods) ? (e.funding_methods as unknown[]).map(String) : [] };
  if (typeof e.min_amount === "number") out.minAmount = e.min_amount;
  if (typeof e.max_amount === "number") out.maxAmount = e.max_amount;
  if (typeof e.fee_percent === "number") out.feePercent = e.fee_percent;
  return out;
}

const numberOrNull = (value: unknown): number | null => (typeof value === "string" || typeof value === "number") && Number.isFinite(Number(value)) ? Number(value) : null;

/**
 * The TR Mock Anchor publishes a status page (`/health`) next to its SEP
 * endpoints: the treasury that pays on-ramps with its balance, and the
 * per-deposit limits in lira that SEP-6 /info cannot express. It is not a
 * SEP, so it is read best-effort and only trusted when it also lists the
 * anchor's SEP endpoints; other anchors simply have none.
 */
async function readStatusPage(base: string): Promise<{ treasury: AnchorDiscovery["treasury"]; fiat: AnchorLimits["fiat"]; minOfframp: number | null }> {
  const none = { treasury: null, fiat: null, minOfframp: null };
  try {
    const res = await fetch(`${base}/health`);
    if (!res.ok) return none;
    const body = (await res.json()) as { sep?: unknown; treasury?: { address?: string; usdc_balance?: string; low_balance?: boolean }; limits?: { min_onramp_try?: string; max_onramp_try?: string; min_offramp_usdc?: string } };
    if (!body.sep || typeof body.sep !== "object") return none;
    const treasury = body.treasury?.address ? { address: body.treasury.address, balance: body.treasury.usdc_balance ?? null, low: body.treasury.low_balance === true } : null;
    const min = numberOrNull(body.limits?.min_onramp_try);
    const max = numberOrNull(body.limits?.max_onramp_try);
    return { treasury, fiat: min !== null || max !== null ? { min, max, source: "anchor" } : null, minOfframp: numberOrNull(body.limits?.min_offramp_usdc) };
  } catch {
    return none;
  }
}

/** Discovery for one anchor (default: the active one). Fetched with the framework data cache (10 min), never held in process memory. */
export async function discoverAnchor(homeDomain?: string): Promise<AnchorDiscovery> {
  const domain = (homeDomain ?? (await activeAnchorHomeDomain())).toLowerCase();
  const base = `https://${domain}`;
  const res = await fetch(`${base}/.well-known/stellar.toml`);
  if (!res.ok) throw new Error(`anchor stellar.toml unavailable at ${domain} (${res.status})`);
  const raw = await res.text();
  const endpoints: Record<string, string> = {};
  for (const key of ["WEB_AUTH_ENDPOINT", "TRANSFER_SERVER", "TRANSFER_SERVER_SEP0024", "KYC_SERVER", "ANCHOR_QUOTE_SERVER", "SIGNING_KEY"]) {
    const m = raw.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
    if (m?.[1]) endpoints[key] = m[1].replace(/\/+$/, "");
  }
  const passphrase = raw.match(/^NETWORK_PASSPHRASE\s*=\s*"([^"]+)"/m)?.[1] ?? "";
  if (passphrase !== networkPassphrase()) {
    throw new Error(`anchor ${domain} is on "${passphrase}" but STELLAR_NETWORK expects "${networkPassphrase()}"`);
  }
  const code = serverEnv.anchorAssetCode();
  const block = raw.split("[[CURRENCIES]]").slice(1).find((b) => new RegExp(`^code\\s*=\\s*"${code}"`, "m").test(b));
  const issuer = block?.match(/^issuer\s*=\s*"([^"]+)"/m)?.[1];
  if (!issuer) throw new Error(`anchor ${domain}: stellar.toml has no ${code} currency`);
  const orgName = raw.match(/^ORG_NAME\s*=\s*"([^"]+)"/m)?.[1] ?? null;
  let fiatCode: string | null = block?.match(/^anchor_asset\s*=\s*"([^"]+)"/m)?.[1]?.toUpperCase() ?? null;
  let sep38: AnchorDiscovery["sep38"] = null;
  if (endpoints.ANCHOR_QUOTE_SERVER) {
    try {
      const info = (await (await fetch(`${endpoints.ANCHOR_QUOTE_SERVER}/info`)).json()) as { assets?: { asset: string; sell_delivery_methods?: { name: string }[]; buy_delivery_methods?: { name: string }[] }[] };
      const fiats = (info.assets ?? []).filter((a) => a.asset.startsWith("iso4217:"));
      const chosen = fiats.find((a) => a.asset === `iso4217:${fiatCode ?? ""}`) ?? fiats[0];
      if (chosen) {
        fiatCode = fiatCode ?? chosen.asset.slice("iso4217:".length);
        sep38 = { sellDeliveryMethods: (chosen.sell_delivery_methods ?? []).map((m) => m.name), buyDeliveryMethods: (chosen.buy_delivery_methods ?? []).map((m) => m.name) };
      }
    } catch {
      sep38 = null;
    }
  }
  let sep6: AnchorDiscovery["sep6"] = null;
  const limits: AnchorLimits = { deposit: { min: null, max: null }, withdraw: { min: null, max: null }, fiat: null };
  if (endpoints.TRANSFER_SERVER) {
    try {
      const info = (await (await fetch(`${endpoints.TRANSFER_SERVER}/info`)).json()) as Record<string, Record<string, unknown>>;
      const deposit = parseSep6Asset(info.deposit?.[code]);
      const withdraw = parseSep6Asset(info.withdraw?.[code]);
      const depositExchange = parseSep6Asset(info["deposit-exchange"]?.[code]);
      const withdrawExchange = parseSep6Asset(info["withdraw-exchange"]?.[code]);
      sep6 = { deposit, withdraw, depositExchange: Boolean(depositExchange), withdrawExchange: Boolean(withdrawExchange) };
      const d = depositExchange ?? deposit;
      const w = withdrawExchange ?? withdraw;
      limits.deposit = { min: d?.minAmount ?? null, max: d?.maxAmount ?? null };
      limits.withdraw = { min: w?.minAmount ?? null, max: w?.maxAmount ?? null };
    } catch {
      sep6 = null;
    }
  }
  const status = await readStatusPage(base);
  limits.fiat = status.fiat;
  if (status.minOfframp !== null) limits.withdraw.min = Math.max(limits.withdraw.min ?? 0, status.minOfframp);
  if (!limits.fiat && fiatCode && endpoints.ANCHOR_QUOTE_SERVER && (limits.deposit.min !== null || limits.deposit.max !== null)) {
    // No fiat limits published: state the asset limits in the anchor's fiat at its own indicative price (fiat per unit of the asset).
    try {
      const method = sep38?.sellDeliveryMethods[0];
      const params = new URLSearchParams({ sell_asset: `iso4217:${fiatCode}`, buy_asset: `stellar:${code}:${issuer}`, buy_amount: "1", context: "sep6", ...(method ? { sell_delivery_method: method } : {}) });
      const price = (await (await fetch(`${endpoints.ANCHOR_QUOTE_SERVER}/price?${params}`)).json()) as { price?: string; total_price?: string };
      const perUnit = Number(price.price ?? price.total_price); // the rate without the anchor's fee; limits are about amounts, not cost
      if (Number.isFinite(perUnit) && perUnit > 0) {
        limits.fiat = { min: limits.deposit.min !== null ? Math.ceil(limits.deposit.min * perUnit * 100) / 100 : null, max: limits.deposit.max !== null ? Math.floor(limits.deposit.max * perUnit * 100) / 100 : null, source: "derived" };
      }
    } catch {
      limits.fiat = null;
    }
  }
  return {
    homeDomain: domain,
    usdc: { code, issuer, contractId: new Asset(code, issuer).contractId(passphrase) },
    endpoints,
    networkPassphrase: passphrase,
    orgName,
    fiatCode,
    sep38,
    sep6,
    limits,
    treasury: status.treasury,
    fetchedAt: Date.now(),
  };
}

/**
 * The sandbox's documented test IBAN. The anchor pays simulated TRY payouts to
 * the customer's IBAN; Kumbara collects no bank details itself, so every
 * sandbox customer is registered with this value. A production anchor collects
 * the real IBAN in its own KYC flow.
 */
export const SANDBOX_TEST_IBAN = "TR330006100519786457841326";
