import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { Address, Asset, BASE_FEE, Contract, TransactionBuilder, contract, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import { discoverAnchor, type AnchorDiscovery } from "./anchor/discovery";
import { createLandingAccount, submitPreauthorized, type LandingDeps, type LandingPlan } from "./anchor/landing";
import { fiatAsset, sep10Authenticate, sep12Register, sep38Quote, sep6DepositExchange, sep6SimulateBankTransfer, sep6Transaction, sep6WithdrawExchange, stellarAsset, type Sep6Instruction } from "./anchor/sep";

export type FundsKind = "deposit" | "withdraw";
export type FundsStage = "awaiting_bank" | "awaiting_passkey" | "awaiting_anchor" | "forwarding" | "completed" | "failed";
export interface FundsRecord {
  id: string;
  kind: FundsKind;
  stage: FundsStage;
  wallet: string;
  anchorHomeDomain: string;
  sepToken: string; // server storage only
  sep6Id: string;
  quoteId: string;
  quotedFiat?: string;
  instructions?: Record<string, Sep6Instruction>;
  plan: LandingPlan; // pre-authorized XDR stays server-side
  forwardHash?: string;
  cleanupHash?: string;
  error?: string;
  createdAt: number;
}
export interface FundsStore { get(id: string): Promise<FundsRecord | undefined>; put(record: FundsRecord): Promise<void> }

/**
 * A transfer in progress is a record the server must keep between requests. A serverless host has no shared disk and
 * sends each request to whichever instance is free, so the record travels with the caller instead: sealed with
 * AES-256-GCM under a key derived from the server's own secret, opaque to the browser holding it, useless anywhere
 * else. It carries a SEP bearer token and pre-authorized XDR, which is exactly why it is never sent in the clear.
 */
export function sealRecord(record: FundsRecord, secret: string): string {
  const key = createHash("sha256").update(`koul-funds:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(record), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openRecord(sealed: string, secret: string): FundsRecord {
  const raw = Buffer.from(sealed, "base64url");
  if (raw.length < 29) throw new Error("Unknown transfer ID");
  const key = createHash("sha256").update(`koul-funds:${secret}`).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  try {
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as FundsRecord;
  } catch {
    throw new Error("Unknown transfer ID");
  }
}
export interface FundsPublic {
  transferId: string; kind: FundsKind; status: FundsStage; wallet: string; landingAccount: string;
  amountUsdc: string; quotedFiat?: string; instructions?: Record<string, Sep6Instruction>;
  anchorStatus?: string; forwardHash?: string; cleanupHash?: string; error?: string;
  unsignedTransfer?: string; // AssembledTransaction.toJSON, only on withdrawal creation
  /** The sealed record. Send it back on the next call so any instance can carry the transfer on. */
  state?: string;
}

export const parseAssetAmount = (value: string): bigint => {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(value)) throw new Error("Amount must have at most 7 decimals");
  const [whole, part = ""] = value.split(".");
  const units = BigInt(whole!) * 10_000_000n + BigInt(part.padEnd(7, "0"));
  if (units <= 0n) throw new Error("Amount must be positive");
  return units;
};
export const formatAssetAmount = (units: bigint) => `${units / 10_000_000n}.${(units % 10_000_000n).toString().padStart(7, "0")}`;
export const publicFundsRecord = (r: FundsRecord, extra: Partial<FundsPublic> = {}): FundsPublic => ({
  transferId: r.id, kind: r.kind, status: r.stage, wallet: r.wallet, landingAccount: r.plan.publicKey,
  amountUsdc: formatAssetAmount(BigInt(r.plan.amountStroops)), quotedFiat: r.quotedFiat,
  instructions: r.instructions, forwardHash: r.forwardHash, cleanupHash: r.cleanupHash, error: r.error, ...extra,
});

export class FundsService {
  private readonly locks = new Map<string, Promise<FundsPublic>>();
  constructor(readonly deps: LandingDeps, readonly store: FundsStore, readonly anchorDomain: string) {}

  private async anchor(): Promise<AnchorDiscovery> { return discoverAnchor(this.anchorDomain); }
  private checkAsset(anchor: AnchorDiscovery) {
    if (!anchor.fiatCode || !anchor.sep38 || !anchor.sep6) throw new Error("Anchor does not offer the required fiat transfer flow");
    return { asset: new Asset(anchor.usdc.code, anchor.usdc.issuer), fiat: fiatAsset(anchor.fiatCode) };
  }
  private async balance(contractId: string, address: string): Promise<bigint> {
    const account = await this.deps.server.getAccount(this.deps.sponsor.publicKey());
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.deps.networkPassphrase })
      .addOperation(new Contract(contractId).call("balance", new Address(address).toScVal())).setTimeout(30).build();
    const sim = await this.deps.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("Landing balance simulation failed");
    return scValToNative(sim.result!.retval) as bigint;
  }

  async createDeposit(input: { wallet: string; amountTry: string; customer: Record<string, string>; simulateSandboxBankTransfer?: boolean }): Promise<FundsPublic> {
    new Address(input.wallet);
    if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(input.amountTry) || Number(input.amountTry) <= 0) throw new Error("Invalid TRY amount");
    const anchor = await this.anchor(), { asset, fiat } = this.checkAsset(anchor);
    if (!anchor.sep6?.depositExchange) throw new Error("Anchor has no deposit-exchange");
    const deliveryMethod = anchor.sep38!.sellDeliveryMethods[0] ?? "bank_account";
    const method = anchor.sep6.deposit?.fundingMethods[0] ?? "bank_account";
    let captured: { token: string; sep6Id: string; quoteId: string; instructions: Record<string, Sep6Instruction> } | undefined;
    const plan = await createLandingAccount(this.deps, {
      usdc: asset, usdcContract: anchor.usdc.contractId, abortable: true,
      beforeLock: async (bridge) => {
        const auth = await sep10Authenticate(anchor, bridge.publicKey, bridge.sign);
        await sep12Register(anchor, auth.token, input.customer);
        const quote = await sep38Quote(anchor, auth.token, { sellAsset: fiat, buyAsset: stellarAsset(anchor.usdc.code, anchor.usdc.issuer), sellAmount: input.amountTry, deliveryMethod, side: "sell" });
        const dep = await sep6DepositExchange(anchor, auth.token, { sourceAsset: fiat, destinationAssetCode: anchor.usdc.code, amount: input.amountTry, quoteId: quote.id, account: bridge.publicKey, type: method });
        captured = { token: auth.token, sep6Id: dep.id, quoteId: quote.id, instructions: dep.instructions };
        return { type: "onramp", destinationContract: input.wallet, amountStroops: parseAssetAmount(quote.buyAmount) };
      },
    });
    if (!captured) throw new Error("Anchor did not create a deposit transfer");
    const got = captured as { token: string; sep6Id: string; quoteId: string; instructions: Record<string, Sep6Instruction> };
    const record: FundsRecord = { id: randomUUID(), kind: "deposit", stage: "awaiting_bank", wallet: input.wallet, anchorHomeDomain: anchor.homeDomain, sepToken: got.token, sep6Id: got.sep6Id, quoteId: got.quoteId, instructions: got.instructions, plan, createdAt: Date.now() };
    await this.store.put(record);
    if (input.simulateSandboxBankTransfer) await sep6SimulateBankTransfer(anchor, got.token, got.sep6Id);
    return this.publish(record);
  }

  async createWithdrawal(input: { wallet: string; amountUsdc: string; iban: string; customer: Record<string, string> }): Promise<FundsPublic> {
    new Address(input.wallet);
    const amount = parseAssetAmount(input.amountUsdc);
    if (!/^TR\d{24}$/.test(input.iban)) throw new Error("Invalid Turkish IBAN format");
    const anchor = await this.anchor(), { asset, fiat } = this.checkAsset(anchor);
    if (await this.balance(anchor.usdc.contractId, input.wallet) < amount) throw new Error("Wallet has insufficient USDC");
    if (!anchor.sep6?.withdrawExchange) throw new Error("Anchor has no withdraw-exchange");
    const method = anchor.sep6.withdraw?.fundingMethods[0] ?? "bank_account";
    const deliveryMethod = anchor.sep38!.buyDeliveryMethods.includes(method) ? method : (anchor.sep38!.buyDeliveryMethods[0] ?? method);
    let captured: { token: string; sep6Id: string; quoteId: string; quotedFiat: string } | undefined;
    const plan = await createLandingAccount(this.deps, {
      usdc: asset, usdcContract: anchor.usdc.contractId,
      beforeLock: async (bridge) => {
        const auth = await sep10Authenticate(anchor, bridge.publicKey, bridge.sign);
        await sep12Register(anchor, auth.token, { ...input.customer, bank_account_number: input.iban });
        const quote = await sep38Quote(anchor, auth.token, { sellAsset: stellarAsset(anchor.usdc.code, anchor.usdc.issuer), buyAsset: fiat, sellAmount: input.amountUsdc, deliveryMethod, side: "sell" });
        const wd = await sep6WithdrawExchange(anchor, auth.token, { sourceAssetCode: anchor.usdc.code, destinationAsset: fiat, amount: input.amountUsdc, quoteId: quote.id, account: bridge.publicKey, type: method, dest: input.iban });
        if (wd.memoType !== "id") throw new Error(`Unsupported anchor memo type: ${wd.memoType}`);
        captured = { token: auth.token, sep6Id: wd.id, quoteId: quote.id, quotedFiat: quote.buyAmount };
        return { type: "offramp", treasury: wd.accountId, memoId: wd.memo, amountStroops: amount };
      },
    });
    if (!captured) throw new Error("Anchor did not create a withdrawal transfer");
    const got = captured as { token: string; sep6Id: string; quoteId: string; quotedFiat: string };
    const record: FundsRecord = { id: randomUUID(), kind: "withdraw", stage: "awaiting_passkey", wallet: input.wallet, anchorHomeDomain: anchor.homeDomain, sepToken: got.token, sep6Id: got.sep6Id, quoteId: got.quoteId, quotedFiat: got.quotedFiat, plan, createdAt: Date.now() };
    await this.store.put(record);
    const tx = await contract.AssembledTransaction.build<null>({
      method: "transfer", args: [new Address(input.wallet).toScVal(), new Address(plan.publicKey).toScVal(), nativeToScVal(amount, { type: "i128" })],
      contractId: anchor.usdc.contractId, networkPassphrase: this.deps.networkPassphrase,
      rpcUrl: this.deps.server.serverURL.toString(), publicKey: this.deps.sponsor.publicKey(), parseResultXdr: () => null,
    });
    return this.publish(record, { unsignedTransfer: tx.toJSON() });
  }

  /** Sandbox only: ask the mock anchor to pretend the user's bank transfer for a deposit arrived. */
  async simulateBankTransfer(id: string, sealed?: string): Promise<FundsPublic> {
    const record = sealed ? openRecord(sealed, this.deps.sponsor.secret()) : await this.store.get(id);
    if (!record) throw new Error("Unknown transfer ID");
    if (record.kind !== "deposit" || record.stage !== "awaiting_bank") throw new Error("Only a deposit waiting for the bank can be simulated");
    const anchor = await discoverAnchor(record.anchorHomeDomain);
    await sep6SimulateBankTransfer(anchor, record.sepToken, record.sep6Id);
    return this.publish(record, { anchorStatus: "pending_anchor" });
  }

  /** Every answer carries the record forward, sealed. */
  private publish(record: FundsRecord, extra: Partial<FundsPublic> = {}): FundsPublic {
    return publicFundsRecord(record, { ...extra, state: sealRecord(record, this.deps.sponsor.secret()) });
  }

  async getStatus(id: string, sealed?: string): Promise<FundsPublic> {
    if (sealed) return this.advance(id, openRecord(sealed, this.deps.sponsor.secret()));
    const ongoing = this.locks.get(id);
    if (ongoing) return ongoing;
    const operation = this.advance(id);
    this.locks.set(id, operation);
    try { return await operation; } finally { this.locks.delete(id); }
  }
  private async advance(id: string, carried?: FundsRecord): Promise<FundsPublic> {
    const record = carried ?? await this.store.get(id);
    if (!record) throw new Error("Unknown transfer ID");
    if (record.stage === "completed" || record.stage === "failed") return this.publish(record);
    const anchor = await discoverAnchor(record.anchorHomeDomain);
    const status = await sep6Transaction(anchor, record.sepToken, record.sep6Id);
    if (/error|expired|refunded/.test(status.status)) { record.stage = "failed"; record.error = status.message ?? status.status; await this.store.put(record); return this.publish(record, { anchorStatus: status.status }); }
    if (record.kind === "deposit") {
      if (status.status !== "completed") return this.publish(record, { anchorStatus: status.status });
      if (await this.balance(anchor.usdc.contractId, record.plan.publicKey) < BigInt(record.plan.amountStroops)) return this.publish(record, { anchorStatus: status.status });
    } else if (record.stage === "awaiting_passkey") {
      if (await this.balance(anchor.usdc.contractId, record.plan.publicKey) < BigInt(record.plan.amountStroops)) return this.publish(record, { anchorStatus: status.status });
      record.stage = "forwarding"; await this.store.put(record);
    }
    if (!record.forwardHash) {
      const forward = await submitPreauthorized(this.deps, record.plan.forwardTxXdr);
      record.forwardHash = forward.hash;
      record.stage = "awaiting_anchor";
      await this.store.put(record);
    }
    if (!record.cleanupHash) {
      const cleanup = await submitPreauthorized(this.deps, record.plan.cleanupTxXdr);
      record.cleanupHash = cleanup.hash;
      await this.store.put(record);
    }
    if (record.kind === "deposit" || status.status === "completed") {
      record.stage = "completed";
      await this.store.put(record);
    }
    return this.publish(record, { anchorStatus: status.status });
  }
}
