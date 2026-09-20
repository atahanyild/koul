/**
 * SEP client for the bridge account: SEP-10 (auth), SEP-12 (KYC), SEP-38
 * (quotes) and SEP-6 (transfers). Every endpoint comes from the anchor's
 * stellar.toml through `discoverAnchor`; nothing is hardcoded. The bridge
 * account authenticates while it still holds its master key, before the lock.
 */
import { Transaction } from "@stellar/stellar-sdk";
import type { AnchorDiscovery } from "./discovery";

export class SepError extends Error {
  constructor(
    readonly sep: "sep10" | "sep12" | "sep38" | "sep6",
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SepError";
  }
  /** Retried by the next poll: the anchor is down or throttling, not refusing. */
  get transient(): boolean {
    return this.status >= 500 || this.status === 429 || this.status === 0;
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function errorMessage(body: Record<string, unknown>): string {
  const e = body.error;
  return typeof e === "string" ? e : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : JSON.stringify(body).slice(0, 200);
}

export interface Sep10Token {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * SEP-10 as the bridge account. Runs before the lock: afterwards the master key
 * (weight 1) no longer meets the thresholds (2), so the challenge signature is
 * refused. The challenge is the only thing this key signs outside the bridge
 * module, and it is never submitted to the network.
 */
export async function sep10Authenticate(anchor: AnchorDiscovery, account: string, sign: (tx: Transaction) => void): Promise<Sep10Token> {
  const webAuth = anchor.endpoints.WEB_AUTH_ENDPOINT;
  if (!webAuth) throw new SepError("sep10", 0, "no_web_auth", "the anchor's stellar.toml has no WEB_AUTH_ENDPOINT");
  let res: Response;
  try {
    res = await fetch(`${webAuth}?${new URLSearchParams({ account, home_domain: anchor.homeDomain })}`, { cache: "no-store" });
  } catch (err) {
    throw new SepError("sep10", 0, "unreachable", `SEP-10 challenge: ${err instanceof Error ? err.message : String(err)}`);
  }
  const challenge = await readJson(res);
  if (!res.ok || typeof challenge.transaction !== "string") throw new SepError("sep10", res.status, "challenge_failed", `SEP-10 challenge: ${errorMessage(challenge)}`);
  const passphrase = typeof challenge.network_passphrase === "string" ? challenge.network_passphrase : anchor.networkPassphrase;
  if (passphrase !== anchor.networkPassphrase) throw new SepError("sep10", 0, "wrong_network", `SEP-10 challenge is for "${passphrase}"`);
  const tx = new Transaction(challenge.transaction, passphrase);
  if (tx.source !== anchor.endpoints.SIGNING_KEY) throw new SepError("sep10", 0, "bad_challenge", "SEP-10 challenge is not signed by the anchor's SIGNING_KEY");
  if (tx.sequence !== "0") throw new SepError("sep10", 0, "bad_challenge", "SEP-10 challenge has a non-zero sequence number");
  if (!tx.operations.some((op) => op.type === "manageData" && op.source === account)) throw new SepError("sep10", 0, "bad_challenge", "SEP-10 challenge does not name the bridge account");
  sign(tx);
  const post = await fetch(webAuth, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transaction: tx.toXDR() }), cache: "no-store" });
  const body = await readJson(post);
  if (!post.ok || typeof body.token !== "string") throw new SepError("sep10", post.status, "auth_failed", `SEP-10 token: ${errorMessage(body)}`);
  let expiresAt = Math.floor(Date.now() / 1000) + 300;
  try {
    const claims = JSON.parse(Buffer.from(body.token.split(".")[1] ?? "", "base64url").toString()) as { exp?: number };
    if (typeof claims.exp === "number") expiresAt = claims.exp;
  } catch {
    /* opaque token: assume five minutes */
  }
  return { token: body.token, expiresAt };
}

/** SEP-12: register the bridge account as a customer. The sandbox needs nothing; a production anchor states its fields, which come back as `required`. */
export async function sep12Register(anchor: AnchorDiscovery, token: string, fields: Record<string, string>, transactionId?: string): Promise<{ status: string; required: string[] }> {
  const kyc = anchor.endpoints.KYC_SERVER;
  if (!kyc) return { status: "no_kyc_server", required: [] };
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (transactionId) form.append("transaction_id", transactionId);
  const put = await fetch(`${kyc}/customer`, { method: "PUT", headers: { authorization: `Bearer ${token}` }, body: form, cache: "no-store" });
  const body = await readJson(put);
  if (!put.ok) throw new SepError("sep12", put.status, "kyc_rejected", `SEP-12: ${errorMessage(body)}`);
  return sep12Status(anchor, token, transactionId);
}

/** What the anchor still needs, in general or for one transaction (some anchors only state fields per transaction). */
export async function sep12Status(anchor: AnchorDiscovery, token: string, transactionId?: string): Promise<{ status: string; required: string[] }> {
  const kyc = anchor.endpoints.KYC_SERVER;
  if (!kyc) return { status: "no_kyc_server", required: [] };
  const query = transactionId ? `?${new URLSearchParams({ transaction_id: transactionId })}` : "";
  const get = await readJson(await fetch(`${kyc}/customer${query}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }));
  const required = Object.entries((get.fields ?? {}) as Record<string, { optional?: boolean }>).filter(([, v]) => v && v.optional === false).map(([k]) => k);
  return { status: typeof get.status === "string" ? get.status : "unknown", required };
}

/** Testnet only: answer a sandbox anchor's per-transaction KYC demands from the fixture. Returns the fields sent. */
export async function sep12AnswerForTransaction(anchor: AnchorDiscovery, token: string, transactionId: string, base: Record<string, string> = {}): Promise<string[]> {
  // One PUT with every field: the reference anchor (testanchor.stellar.org) checks a transaction's requirements
  // against the fields of that PUT alone, and a partial answer parks the transaction in pending_customer_info_update for good.
  const answers = { ...SANDBOX_KYC_FIXTURE, ...base };
  await sep12Register(anchor, token, answers, transactionId);
  return Object.keys(answers);
}

/**
 * Sandbox KYC answers for anchors that insist on personal fields (testanchor.stellar.org does).
 * Testnet only: a production anchor gets the customer's real data through its own KYC flow.
 */
export const SANDBOX_KYC_FIXTURE: Record<string, string> = {
  email_address: "kumbara-testnet@example.com",
  address: "Istanbul, testnet",
  city: "Istanbul",
  state_or_province: "Istanbul",
  postal_code: "34000",
  address_country_code: "TUR",
  mobile_number: "+905550000000",
  birth_date: "1990-01-01",
  birth_place: "Istanbul",
  birth_country_code: "TUR",
  id_type: "passport",
  id_number: "TESTNET0001",
  id_country_code: "TUR",
  id_issue_date: "2020-01-01",
  id_expiration_date: "2030-01-01",
  bank_account_type: "checking",
  occupation: "engineer",
};

/** SEP-6 deposit without a quote: `amount` is in the asset. For anchors without deposit-exchange. */
export async function sep6Deposit(anchor: AnchorDiscovery, token: string, input: { assetCode: string; amount: string; account: string; type: string }): Promise<Sep6DepositResponse> {
  const params = new URLSearchParams({ asset_code: input.assetCode, amount: input.amount, account: input.account, type: input.type });
  const res = await fetch(`${anchor.endpoints.TRANSFER_SERVER}/deposit?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await readJson(res);
  if (res.status === 403) throw new SepError("sep6", 403, String(body.type ?? "customer_info_needed"), `SEP-6 deposit needs more customer information: ${JSON.stringify(body.fields ?? body).slice(0, 200)}`);
  if (!res.ok || typeof body.id !== "string") throw new SepError("sep6", res.status, "deposit_refused", `SEP-6 deposit: ${errorMessage(body)}`);
  return parseDepositResponse(body);
}

export interface Sep38Quote {
  id: string;
  sellAsset: string;
  buyAsset: string;
  sellAmount: string;
  buyAmount: string;
  /** Units of sell asset per unit of buy asset, as the anchor states it. */
  price: string;
  expiresAt: string;
}

/** SEP-38 firm quote, bound to the authenticated bridge account. */
export async function sep38Quote(anchor: AnchorDiscovery, token: string, input: { sellAsset: string; buyAsset: string; sellAmount?: string; buyAmount?: string; deliveryMethod: string; side: "sell" | "buy" }): Promise<Sep38Quote> {
  const quotes = anchor.endpoints.ANCHOR_QUOTE_SERVER;
  if (!quotes) throw new SepError("sep38", 0, "no_quote_server", "the anchor's stellar.toml has no ANCHOR_QUOTE_SERVER");
  const body: Record<string, string> = { sell_asset: input.sellAsset, buy_asset: input.buyAsset, context: "sep6" };
  if (input.sellAmount) body.sell_amount = input.sellAmount;
  if (input.buyAmount) body.buy_amount = input.buyAmount;
  if (input.side === "buy") body.sell_delivery_method = input.deliveryMethod;
  else body.buy_delivery_method = input.deliveryMethod;
  const res = await fetch(`${quotes}/quote`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const q = await readJson(res);
  if (!res.ok || typeof q.id !== "string") throw new SepError("sep38", res.status, "quote_failed", `SEP-38 quote: ${errorMessage(q)}`);
  return { id: q.id, sellAsset: String(q.sell_asset), buyAsset: String(q.buy_asset), sellAmount: String(q.sell_amount), buyAmount: String(q.buy_amount), price: String(q.price), expiresAt: String(q.expires_at) };
}

/** SEP-38 indicative price (no auth): what the Deposit and Withdraw screens show before a firm quote exists. */
export async function sep38Price(anchor: AnchorDiscovery, input: { sellAsset: string; buyAsset: string; sellAmount?: string; buyAmount?: string; deliveryMethod: string; side: "sell" | "buy" }): Promise<{ price: string; sellAmount: string; buyAmount: string; feeTotal?: string }> {
  const quotes = anchor.endpoints.ANCHOR_QUOTE_SERVER;
  if (!quotes) throw new SepError("sep38", 0, "no_quote_server", "the anchor's stellar.toml has no ANCHOR_QUOTE_SERVER");
  const params: Record<string, string> = { sell_asset: input.sellAsset, buy_asset: input.buyAsset, context: "sep6" };
  if (input.sellAmount) params.sell_amount = input.sellAmount;
  if (input.buyAmount) params.buy_amount = input.buyAmount;
  if (input.side === "buy") params.sell_delivery_method = input.deliveryMethod;
  else params.buy_delivery_method = input.deliveryMethod;
  const res = await fetch(`${quotes}/price?${new URLSearchParams(params)}`, { cache: "no-store" });
  const p = await readJson(res);
  if (!res.ok || typeof p.price !== "string") throw new SepError("sep38", res.status, "price_failed", `SEP-38 price: ${errorMessage(p)}`);
  const fee = p.fee as { total?: string } | undefined;
  const out: { price: string; sellAmount: string; buyAmount: string; feeTotal?: string } = { price: p.price, sellAmount: String(p.sell_amount), buyAmount: String(p.buy_amount) };
  if (fee?.total) out.feeTotal = fee.total;
  return out;
}

export interface Sep6Instruction {
  value: string;
  description?: string;
}
export interface Sep6DepositResponse {
  id: string;
  how?: string;
  instructions: Record<string, Sep6Instruction>;
  eta?: number;
  moreInfoUrl?: string;
  raw: Record<string, unknown>;
}

/** SEP-6 deposit-exchange: TRY in, USDC out to the bridge account at the firm quote. The trustline already exists, so `pending_trust` cannot occur. */
export async function sep6DepositExchange(anchor: AnchorDiscovery, token: string, input: { sourceAsset: string; destinationAssetCode: string; amount: string; quoteId: string; account: string; type: string }): Promise<Sep6DepositResponse> {
  const params = new URLSearchParams({ source_asset: input.sourceAsset, destination_asset: input.destinationAssetCode, amount: input.amount, quote_id: input.quoteId, account: input.account, type: input.type });
  const res = await fetch(`${anchor.endpoints.TRANSFER_SERVER}/deposit-exchange?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await readJson(res);
  if (res.status === 403) throw new SepError("sep6", 403, String(body.type ?? "customer_info_needed"), `SEP-6 deposit needs more customer information: ${JSON.stringify(body.fields ?? body).slice(0, 200)}`);
  if (!res.ok || typeof body.id !== "string") throw new SepError("sep6", res.status, "deposit_refused", `SEP-6 deposit-exchange: ${errorMessage(body)}`);
  return parseDepositResponse(body);
}

export function parseInstructions(raw: unknown): Record<string, Sep6Instruction> {
  const instructions: Record<string, Sep6Instruction> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (v && typeof v === "object" && "value" in v) {
        const item = v as { value: unknown; description?: unknown };
        const entry: Sep6Instruction = { value: String(item.value) };
        if (typeof item.description === "string") entry.description = item.description;
        instructions[k] = entry;
      }
    }
  }
  return instructions;
}

function parseDepositResponse(body: Record<string, unknown>): Sep6DepositResponse {
  const raw = body.instructions;
  const instructions = parseInstructions(raw);
  const out: Sep6DepositResponse = { id: String(body.id), instructions, raw: body };
  if (typeof body.how === "string") out.how = body.how;
  if (typeof body.eta === "number") out.eta = body.eta;
  if (typeof body.more_info_url === "string") out.moreInfoUrl = body.more_info_url;
  return out;
}

export interface Sep6WithdrawResponse {
  id: string;
  accountId: string;
  memoType: string;
  memo: string;
  eta?: number;
  raw: Record<string, unknown>;
}

/** SEP-6 withdraw-exchange: USDC from the reverse bridge to the anchor's account with the memo it names; TRY to the customer's own bank account. */
export async function sep6WithdrawExchange(anchor: AnchorDiscovery, token: string, input: { sourceAssetCode: string; destinationAsset: string; amount: string; quoteId: string; account: string; type: string; dest: string }): Promise<Sep6WithdrawResponse> {
  const params = new URLSearchParams({ source_asset: input.sourceAssetCode, destination_asset: input.destinationAsset, amount: input.amount, quote_id: input.quoteId, account: input.account, type: input.type, dest: input.dest });
  const res = await fetch(`${anchor.endpoints.TRANSFER_SERVER}/withdraw-exchange?${params}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await readJson(res);
  if (res.status === 403) throw new SepError("sep6", 403, String(body.type ?? "customer_info_needed"), `SEP-6 withdrawal needs more customer information: ${JSON.stringify(body.fields ?? body).slice(0, 200)}`);
  if (!res.ok || typeof body.id !== "string" || typeof body.account_id !== "string") throw new SepError("sep6", res.status, "withdraw_refused", `SEP-6 withdraw-exchange: ${errorMessage(body)}`);
  const out: Sep6WithdrawResponse = { id: body.id, accountId: body.account_id, memoType: String(body.memo_type ?? "id"), memo: String(body.memo ?? ""), raw: body };
  if (typeof body.eta === "number") out.eta = body.eta;
  return out;
}

export interface Sep6Transaction {
  id: string;
  kind: string;
  status: string;
  amountIn?: string;
  amountOut?: string;
  amountFee?: string;
  stellarTransactionId?: string;
  externalTransactionId?: string;
  message?: string;
  moreInfoUrl?: string;
  /** Some anchors (testanchor.stellar.org) attach the bank instructions to the transaction, not the request. */
  instructions?: Record<string, Sep6Instruction>;
  raw: Record<string, unknown>;
}

/** GET /transaction with the bridge account's token. */
export async function sep6Transaction(anchor: AnchorDiscovery, token: string, id: string): Promise<Sep6Transaction> {
  let res: Response;
  try {
    res = await fetch(`${anchor.endpoints.TRANSFER_SERVER}/transaction?${new URLSearchParams({ id })}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch (err) {
    throw new SepError("sep6", 0, "unreachable", `SEP-6 transaction: ${err instanceof Error ? err.message : String(err)}`);
  }
  const body = await readJson(res);
  const tx = body.transaction as Record<string, unknown> | undefined;
  if (!res.ok || !tx) throw new SepError("sep6", res.status, "transaction_lookup_failed", `SEP-6 transaction: ${errorMessage(body)}`);
  const str = (k: string): string | undefined => (typeof tx[k] === "string" ? (tx[k] as string) : typeof tx[k] === "number" ? String(tx[k]) : undefined);
  const out: Sep6Transaction = { id: String(tx.id), kind: String(tx.kind), status: String(tx.status), raw: tx };
  if (tx.instructions && typeof tx.instructions === "object") out.instructions = parseInstructions(tx.instructions);
  for (const [key, field] of [["amountIn", "amount_in"], ["amountOut", "amount_out"], ["amountFee", "amount_fee"], ["stellarTransactionId", "stellar_transaction_id"], ["externalTransactionId", "external_transaction_id"], ["message", "message"], ["moreInfoUrl", "more_info_url"]] as const) {
    const v = str(field);
    if (v !== undefined) (out as unknown as Record<string, string>)[key] = v;
  }
  return out;
}

/**
 * Sandbox only: tell the anchor that the TRY for this SEP-6 deposit arrived. The
 * TR Mock Anchor exposes it next to the transaction; a production anchor has no
 * such hook, and the call reports that instead of pretending.
 */
export async function sep6SimulateBankTransfer(anchor: AnchorDiscovery, token: string, id: string): Promise<{ ok: boolean; status: number; detail: string }> {
  const res = await fetch(`${anchor.endpoints.TRANSFER_SERVER}/tx/${encodeURIComponent(id)}/simulate-bank-transfer`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}", cache: "no-store" });
  const body = await readJson(res);
  if (res.status === 404 || res.status === 405) return { ok: false, status: res.status, detail: "this anchor has no sandbox bank-transfer hook" };
  return { ok: res.ok, status: res.status, detail: res.ok ? String((body.transaction as { status?: string } | undefined)?.status ?? "ok") : errorMessage(body) };
}

/** SEP-38 asset identifiers. */
export const fiatAsset = (code: string) => `iso4217:${code}`;
export const stellarAsset = (code: string, issuer: string) => `stellar:${code}:${issuer}`;
