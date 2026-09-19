/**
 * Landing accounts ("emanet hesabı"): ownerless classic accounts that let an
 * anchor which only pays or watches classic G… addresses work with contract
 * wallets, without anybody holding custody.
 *
 * Per deposit or withdrawal:
 *   A. sponsor transaction: create the landing account with sponsored
 *      reserves (zero XLM by default) and a USDC trustline; the landing key
 *      signs its own operations.
 *   B. two pre-authorized transactions for the landing account:
 *        forward (seq+1): on-ramp  → SAC transfer(landing → user's smart
 *                         account, exact quoted amount)
 *                         off-ramp → classic payment(treasury, exact amount)
 *                         with the anchor's memo id
 *        cleanup (seq+2): drop the trustline, merge into the sponsor
 *      Both envelopes are co-signed by the landing master key right here.
 *   C. sponsor transaction: add both hashes as pre-authorized signers (weight
 *      1 each), master weight 1, every threshold 2. Each envelope therefore
 *      needs its pre-authorized hash AND the attached co-signature (1 + 1);
 *      the master key alone authorizes nothing, and the thresholds can no
 *      longer be changed. (The co-signature must count: Stellar rejects
 *      envelopes carrying signatures it did not need, and the relay treats an
 *      envelope with no signatures as an unsigned func/auth request.)
 *   D. the landing secret is wiped in place and dropped. In total it signs
 *      four envelopes: the two sponsor transactions of steps A and C (as the
 *      source of its own operations) and the two pre-authorized envelopes of
 *      step B, plus, when the caller passes `beforeLock`, one SEP-10 challenge
 *      between A and B that is never submitted to the network (the anchor
 *      refuses it after the lock: master weight 1 against thresholds 2). The
 *      hook is how the SEP-6 path learns the exact amount and, for
 *      withdrawals, the anchor's account and memo before the pre-authorized
 *      envelopes are built. Only the public key and the envelopes leave this
 *      function. Nothing here logs, stores or returns the secret;
 *      `assertNoSecret` guards the plan.
 *
 * Later, forward and cleanup are submitted through the relay, which fee-bumps
 * them. They carry no time bound (a relay outage delays, never invalidates)
 * and, for Soroban, a 100-stroop inclusion fee on top of the declared
 * resource fee, which is what the relay's fee-bump rule expects.
 */
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Operation,
  SorobanDataBuilder,
  TimeoutInfinite,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { assertNoSecret } from "./secret-guard";

export interface RelaySubmitter {
  sendXdr(envelopeXdr: string): Promise<{ success: boolean; hash?: string; error?: string; errorCode?: string }>;
}

export interface LandingDeps {
  server: rpc.Server;
  networkPassphrase: string;
  /** Pays the two setup transactions and sponsors the reserves. Never touches USDC. */
  sponsor: Keypair;
  relay: RelaySubmitter;
  /** Receives progress lines. Only public data is ever passed to it. */
  log?: (message: string) => void;
  /** Keypair source for the landing account (tests inject a known key). */
  makeKeypair?: () => Keypair;
}

export type LandingKind =
  | { type: "onramp"; destinationContract: string; amountStroops: bigint }
  | { type: "offramp"; treasury: string; memoId: string; amountStroops: bigint };

/** What `beforeLock` gets: the account exists with its trustline, and it can still sign (only the SEP-10 challenge is expected). */
export interface BridgeBeforeLock {
  publicKey: string;
  /** Signs a challenge transaction with the landing key. Counts every call; the plan reports it. */
  sign: (tx: Transaction) => void;
}

export interface LandingInput {
  usdc: Asset;
  usdcContract: string;
  /** Known up front, or returned by `beforeLock` once the anchor has named the destination and amount. */
  kind?: LandingKind;
  /** Runs after creation and before the lock; must return the kind the pre-authorized envelopes are built for. */
  beforeLock?: (bridge: BridgeBeforeLock) => Promise<LandingKind>;
  /** XLM parked on the account (default "0": the relay pays every later fee). */
  feeBufferXlm?: string;
  /**
   * Also pre-authorize an abort envelope at seq+1 (drop the trustline, merge into
   * the sponsor). It competes with the forward for the same sequence number: once
   * the anchor has paid and the forward ran, the abort is dead; if the user never
   * transfers, the abort returns the sponsor's reserves. SEP-6 deposits need it
   * because the bridge exists before any lira moves.
   */
  abortable?: boolean;
}

/** Everything a caller needs later. Contains no secret material. */
export interface LandingPlan {
  publicKey: string;
  kind: LandingKind["type"];
  amountStroops: string;
  createTxHash: string;
  lockTxHash: string;
  forwardTxXdr: string;
  forwardTxHash: string;
  cleanupTxXdr: string;
  cleanupTxHash: string;
  sponsorFeesStroops: string;
  /** Challenge transactions signed through `beforeLock` (1 for SEP-10; 0 when there is no hook). */
  challengesSigned: number;
  /** Present when `abortable`: the seq+1 envelope that merges the bridge back before any funds arrive. */
  abortTxXdr?: string;
  abortTxHash?: string;
}

export class LandingError extends Error {
  constructor(
    readonly code: "simulation_failed" | "submit_failed" | "sponsor_underfunded",
    message: string,
  ) {
    super(message);
    this.name = "LandingError";
  }
}

/** Zero the keypair's secret material in place. The object stays unusable. */
export function wipeKeypair(keypair: Keypair): void {
  const internal = keypair as unknown as { _secretKey?: Buffer; _secretSeed?: Buffer };
  try {
    keypair.rawSecretKey().fill(0);
  } catch {
    /* public-only keypair */
  }
  internal._secretKey?.fill(0);
  internal._secretSeed?.fill(0);
}

function addressScVal(address: string): xdr.ScVal {
  return Address.fromString(address).toScVal();
}

function i128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: "i128" });
}

function stroopsToAmount(stroops: bigint): string {
  return `${stroops / 10_000_000n}.${(stroops % 10_000_000n).toString().padStart(7, "0")}`;
}

function transferHostFunction(usdcContract: string, from: string, to: string, amount: bigint): xdr.HostFunction {
  return xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(usdcContract).toScAddress(),
      functionName: "transfer",
      args: [addressScVal(from), addressScVal(to), i128(amount)],
    }),
  );
}

function sourceAccountAuth(usdcContract: string, from: string, to: string, amount: bigint): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: Address.fromString(usdcContract).toScAddress(),
          functionName: "transfer",
          args: [addressScVal(from), addressScVal(to), i128(amount)],
        }),
      ),
      subInvocations: [],
    }),
  });
}

/**
 * Submit and wait for inclusion. Testnet RPC nodes lose sight of a transaction often enough that the hash alone
 * is not a reliable answer: the poll can end NOT_FOUND for something that did land. So the wait is short, a
 * re-broadcast of the same signed envelope follows (same hash and sequence: it lands once or comes back a
 * duplicate), and the caller can hand over a `landed` check that looks at the world instead of the ledger
 * index — for an account creation, "does the account exist" settles it in one call.
 */
async function submit(deps: LandingDeps, tx: Transaction, landed?: () => Promise<boolean>): Promise<{ hash: string; ledger: number }> {
  const sent = await deps.server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    let code = "unknown";
    try {
      code = sent.errorResult?.result().switch().name ?? "unknown";
    } catch {
      code = "unknown";
    }
    throw new LandingError("submit_failed", `transaction rejected: ${code} (${sent.errorResult?.toXDR("base64") ?? "unknown"})`);
  }
  const log = deps.log ?? (() => undefined);
  const polled = await deps.server.pollTransaction(sent.hash, { attempts: 20 });
  if (polled.status === "SUCCESS") return { hash: sent.hash, ledger: polled.ledger };
  if (polled.status === "NOT_FOUND") {
    if (await landed?.().catch(() => false)) {
      log(`transaction ${sent.hash} not found by the RPC, but its effect is on chain; carrying on`);
      return { hash: sent.hash, ledger: 0 };
    }
    log(`transaction ${sent.hash} not found after the first poll; re-broadcasting once`);
    const again = await deps.server.sendTransaction(tx);
    if (again.status !== "ERROR") {
      const second = await deps.server.pollTransaction(sent.hash, { attempts: 20 });
      if (second.status === "SUCCESS") return { hash: sent.hash, ledger: second.ledger };
      if (await landed?.().catch(() => false)) {
        log(`transaction ${sent.hash} still not found, but its effect is on chain; carrying on`);
        return { hash: sent.hash, ledger: 0 };
      }
      throw new LandingError("submit_failed", `transaction ${sent.hash} ${second.status} after a re-broadcast`);
    }
  }
  throw new LandingError("submit_failed", `transaction ${sent.hash} ${polled.status}`);
}

/**
 * A sponsor-sourced transaction, built against the sponsor's current sequence and retried with a fresh one when the
 * network rejects it as a bad sequence: two deposits started within the same seconds (two visitors at the booth, or a
 * preview and a production run sharing the sponsor) otherwise lose one of them. Only pre-flight rejections are retried;
 * a transaction that was included and failed is reported as such.
 */
async function submitSponsored(deps: LandingDeps, sponsorPub: string, build: (sponsorAccount: Account) => Transaction, signers: Keypair[], landed?: () => Promise<boolean>): Promise<{ hash: string; ledger: number; fee: string }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const sponsorAccount = await deps.server.getAccount(sponsorPub);
    const tx = build(sponsorAccount);
    tx.sign(...signers);
    try {
      return { ...(await submit(deps, tx, landed)), fee: tx.fee };
    } catch (err) {
      lastError = err;
      const badSeq = err instanceof LandingError && /txBadSeq/.test(err.message);
      if (!badSeq || attempt === 3) throw err;
      deps.log?.(`sponsor sequence collided (attempt ${attempt}); rebuilding with a fresh sequence`);
      await new Promise((r) => setTimeout(r, 300 + Math.floor(Math.random() * 700)));
    }
  }
  throw lastError;
}

/** Soroban forward: footprint from a zero-amount simulation, resources padded. */
async function buildSorobanForward(deps: LandingDeps, landing: string, seq: bigint, input: LandingInput, destination: string, amount: bigint): Promise<Transaction> {
  const probe = new TransactionBuilder(new Account(landing, seq.toString()), { fee: BASE_FEE, networkPassphrase: deps.networkPassphrase })
    .addOperation(Operation.invokeHostFunction({ func: transferHostFunction(input.usdcContract, landing, destination, 0n), auth: [] }))
    .setTimeout(3600)
    .build();
  const sim = await deps.server.simulateTransaction(probe);
  if (rpc.Api.isSimulationError(sim)) throw new LandingError("simulation_failed", `forward footprint simulation failed: ${sim.error}`);
  const simData = sim.transactionData.build();
  const res = simData.resources();
  const instructions = Math.min(Math.ceil(res.instructions() * 1.3) + 200_000, 100_000_000);
  const readBytes = Math.ceil(res.diskReadBytes() * 1.5) + 1_000;
  const writeBytes = Math.ceil(res.writeBytes() * 1.5) + 1_000;
  const resourceFee = (BigInt(sim.minResourceFee) * 3n) / 2n + 200_000n;
  const data = new SorobanDataBuilder(simData).setResources(instructions, readBytes, writeBytes).setResourceFee(resourceFee).build();
  // TransactionBuilder adds the declared resource fee on top of this inclusion fee.
  return new TransactionBuilder(new Account(landing, seq.toString()), { fee: BASE_FEE, networkPassphrase: deps.networkPassphrase })
    .addOperation(
      Operation.invokeHostFunction({
        func: transferHostFunction(input.usdcContract, landing, destination, amount),
        auth: [sourceAccountAuth(input.usdcContract, landing, destination, amount)],
      }),
    )
    .setSorobanData(data)
    .setTimeout(TimeoutInfinite)
    .build();
}

function buildClassicForward(deps: LandingDeps, landing: string, seq: bigint, input: LandingInput, treasury: string, memoId: string, amount: bigint): Transaction {
  return new TransactionBuilder(new Account(landing, seq.toString()), { fee: "1000", networkPassphrase: deps.networkPassphrase })
    .addOperation(Operation.payment({ destination: treasury, asset: input.usdc, amount: stroopsToAmount(amount) }))
    .addMemo(Memo.id(memoId))
    .setTimeout(TimeoutInfinite)
    .build();
}

export async function createLandingAccount(deps: LandingDeps, input: LandingInput): Promise<LandingPlan> {
  const log = deps.log ?? (() => undefined);
  const passphrase = deps.networkPassphrase;
  const sponsorPub = deps.sponsor.publicKey();
  let landing: Keypair | null = deps.makeKeypair ? deps.makeKeypair() : Keypair.random();
  const landingPub = landing.publicKey();
  log(`landing account ${landingPub} (${input.kind?.type ?? "kind set by the anchor before the lock"})`);

  try {
    // A: sponsored creation + trustline.
    const landingKey = landing;
    const created = await submitSponsored(
      deps,
      sponsorPub,
      (sponsorAccount) =>
        new TransactionBuilder(sponsorAccount, { fee: "1000", networkPassphrase: passphrase })
          .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: landingPub }))
          .addOperation(Operation.createAccount({ destination: landingPub, startingBalance: input.feeBufferXlm ?? "0" }))
          .addOperation(Operation.changeTrust({ asset: input.usdc, source: landingPub }))
          .addOperation(Operation.endSponsoringFutureReserves({ source: landingPub }))
          .setTimeout(300)
          .build(),
      [deps.sponsor, landingKey],
      // The RPC losing sight of this transaction does not mean it failed: if the account is there, it landed.
      async () => {
        try {
          await deps.server.getAccount(landingPub);
          return true;
        } catch {
          return false;
        }
      },
    );

    // A½: the anchor conversation that needs the master key (SEP-10) and fixes
    // the amount, before anything is locked. The key signs challenges only.
    let challengesSigned = 0;
    let kind: LandingKind | undefined = input.kind;
    if (input.beforeLock) {
      const key = landing;
      try {
        kind = await input.beforeLock({
          publicKey: landingPub,
          sign: (tx) => {
            if (tx.sequence !== "0") throw new LandingError("submit_failed", "the landing key only signs SEP-10 challenges (sequence 0)");
            challengesSigned += 1;
            tx.sign(key);
          },
        });
      } catch (err) {
        // The anchor refused before anything was locked: merge the account back so the sponsor's reserves return.
        try {
          const sponsorNow = await deps.server.getAccount(sponsorPub);
          const undo = new TransactionBuilder(sponsorNow, { fee: "1000", networkPassphrase: passphrase })
            .addOperation(Operation.changeTrust({ asset: input.usdc, limit: "0", source: landingPub }))
            .addOperation(Operation.accountMerge({ destination: sponsorPub, source: landingPub }))
            .setTimeout(300)
            .build();
          undo.sign(deps.sponsor, key);
          await submit(deps, undo);
          log(`landing account ${landingPub} merged back after the anchor refused`);
        } catch (undoErr) {
          log(`landing account ${landingPub} could not be merged back: ${undoErr instanceof Error ? undoErr.message : String(undoErr)}`);
        }
        throw err;
      }
    }
    if (!kind) throw new LandingError("submit_failed", "landing kind missing: pass `kind` or a `beforeLock` that returns it");

    const landingAccount = await deps.server.getAccount(landingPub);
    const seq = BigInt(landingAccount.sequenceNumber());

    // B: pre-authorized transactions at seq+1 and seq+2 (an Account at `seq`
    // yields the seq+1 transaction), co-signed now.
    const forwardTx =
      kind.type === "onramp"
        ? await buildSorobanForward(deps, landingPub, seq, input, kind.destinationContract, kind.amountStroops)
        : buildClassicForward(deps, landingPub, seq, input, kind.treasury, kind.memoId, kind.amountStroops);
    const cleanupTx = new TransactionBuilder(new Account(landingPub, (seq + 1n).toString()), { fee: "1000", networkPassphrase: passphrase })
      .addOperation(Operation.changeTrust({ asset: input.usdc, limit: "0" }))
      .addOperation(Operation.accountMerge({ destination: sponsorPub }))
      .setTimeout(TimeoutInfinite)
      .build();
    forwardTx.sign(landing);
    cleanupTx.sign(landing);
    let abortTx: Transaction | null = null;
    if (input.abortable) {
      abortTx = new TransactionBuilder(new Account(landingPub, seq.toString()), { fee: "1000", networkPassphrase: passphrase })
        .addOperation(Operation.changeTrust({ asset: input.usdc, limit: "0" }))
        .addOperation(Operation.accountMerge({ destination: sponsorPub }))
        .setTimeout(TimeoutInfinite)
        .build();
      abortTx.sign(landing);
    }

    // C: lock. The landing key co-signs; it is wiped the moment the lock is on chain.
    const lockKey = landing;
    const locked = await submitSponsored(
      deps,
      sponsorPub,
      (sponsorAccount) => {
        const lockBuilder = new TransactionBuilder(sponsorAccount, { fee: "1000", networkPassphrase: passphrase })
          .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: landingPub }))
          .addOperation(Operation.setOptions({ source: landingPub, signer: { preAuthTx: forwardTx.hash(), weight: 1 } }))
          .addOperation(Operation.setOptions({ source: landingPub, signer: { preAuthTx: cleanupTx.hash(), weight: 1 } }));
        if (abortTx) lockBuilder.addOperation(Operation.setOptions({ source: landingPub, signer: { preAuthTx: abortTx.hash(), weight: 1 } }));
        return lockBuilder
          .addOperation(Operation.setOptions({ source: landingPub, masterWeight: 1, lowThreshold: 2, medThreshold: 2, highThreshold: 2 }))
          .addOperation(Operation.endSponsoringFutureReserves({ source: landingPub }))
          .setTimeout(300)
          .build();
      },
      [deps.sponsor, lockKey],
    );

    // D: the secret is no longer needed by anyone, ever.
    wipeKeypair(landing);
    landing = null;
    const plan: LandingPlan = {
      publicKey: landingPub,
      kind: kind.type,
      amountStroops: kind.amountStroops.toString(),
      createTxHash: created.hash,
      lockTxHash: locked.hash,
      forwardTxXdr: forwardTx.toXDR(),
      forwardTxHash: forwardTx.hash().toString("hex"),
      cleanupTxXdr: cleanupTx.toXDR(),
      cleanupTxHash: cleanupTx.hash().toString("hex"),
      sponsorFeesStroops: (BigInt(created.fee) + BigInt(locked.fee)).toString(),
      challengesSigned,
    };
    if (abortTx) {
      plan.abortTxXdr = abortTx.toXDR();
      plan.abortTxHash = abortTx.hash().toString("hex");
    }
    assertNoSecret(plan, "landing plan");
    return plan;
  } finally {
    if (landing) {
      wipeKeypair(landing);
      landing = null;
    }
  }
}

export interface PreauthResult {
  hash: string;
  ledger: number;
  /** "relay" when the relay fee-bumped it; "direct" when the landing account paid from its own buffer. */
  via: "relay" | "direct";
  relayError?: string;
}

/** Submit a pre-authorized envelope: relay (fee-bumped) first, direct as last resort. */
export async function submitPreauthorized(deps: LandingDeps, envelopeXdr: string): Promise<PreauthResult> {
  const log = deps.log ?? (() => undefined);
  const relayed = await deps.relay.sendXdr(envelopeXdr);
  if (relayed.success && relayed.hash) {
    const polled = await deps.server.pollTransaction(relayed.hash, { attempts: 40 });
    if (polled.status === "SUCCESS") return { hash: relayed.hash, ledger: polled.ledger, via: "relay" };
    throw new LandingError("submit_failed", `relayed pre-authorized transaction ${relayed.hash} ended ${polled.status}`);
  }
  log(`relay refused to fee-bump (${relayed.errorCode ?? ""} ${relayed.error ?? ""}); trying direct submission`);
  const tx = TransactionBuilder.fromXDR(envelopeXdr, deps.networkPassphrase) as Transaction;
  const direct = await submit(deps, tx);
  const out: PreauthResult = { ...direct, via: "direct" };
  if (relayed.error) out.relayError = relayed.error;
  return out;
}
