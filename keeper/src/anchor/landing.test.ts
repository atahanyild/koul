/**
 * Secret hygiene and lock invariants of the landing account, against a fake
 * RPC so the test runs offline. Run with `pnpm test` (node --expose-gc, so the
 * "not retained" assertion can force a garbage collection).
 */
import { Account, Asset, Keypair, Operation, SorobanDataBuilder, TransactionBuilder, xdr, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { assertNoSecret, containsSecret, findSecrets } from "./secret-guard";
import { createLandingAccount, submitPreauthorized, wipeKeypair, type LandingDeps } from "./landing";

const PASSPHRASE = "Test SDF Network ; September 2015";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC = new Asset("USDC", USDC_ISSUER);
const USDC_SAC = USDC.contractId(PASSPHRASE);
const SMART_ACCOUNT = "CB5TQJAGOSCO5W6DOJRO65DKVX7ULEVRIEN52KOLGBIJNIC263JYVAPX";

interface Fake {
  submitted: Transaction[];
  relayed: string[];
  deps: LandingDeps;
  logs: string[];
}

function fakeDeps(makeKeypair?: () => Keypair): Fake {
  const sponsor = Keypair.random();
  const sequences = new Map<string, bigint>([[sponsor.publicKey(), 100n]]);
  const submitted: Transaction[] = [];
  const relayed: string[] = [];
  const logs: string[] = [];
  const server = {
    async getAccount(pub: string) {
      if (!sequences.has(pub)) sequences.set(pub, 4_000_000n << 32n);
      return new Account(pub, sequences.get(pub)!.toString());
    },
    async simulateTransaction() {
      return { transactionData: new SorobanDataBuilder(), minResourceFee: "100000", result: { auth: [] }, latestLedger: 1, events: [] };
    },
    async sendTransaction(tx: Transaction) {
      submitted.push(tx);
      sequences.set(tx.source, BigInt(tx.sequence));
      return { status: "PENDING", hash: tx.hash().toString("hex") };
    },
    async pollTransaction(hash: string) {
      return { status: "SUCCESS", ledger: 1, hash };
    },
  };
  const relay = {
    async sendXdr(envelope: string) {
      relayed.push(envelope);
      const tx = TransactionBuilder.fromXDR(envelope, PASSPHRASE) as Transaction;
      return { success: true, hash: tx.hash().toString("hex") };
    },
  };
  const deps: LandingDeps = {
    server: server as unknown as LandingDeps["server"],
    networkPassphrase: PASSPHRASE,
    sponsor,
    relay,
    log: (m) => logs.push(m),
    ...(makeKeypair ? { makeKeypair } : {}),
  };
  return { submitted, relayed, deps, logs };
}

const onramp = (amount = 20_541_582n) => ({
  usdc: USDC,
  usdcContract: USDC_SAC,
  kind: { type: "onramp" as const, destinationContract: SMART_ACCOUNT, amountStroops: amount },
});

describe("secret guard", () => {
  it("finds a real secret seed inside nested data and ignores look-alikes", () => {
    const secret = Keypair.random().secret();
    expect(findSecrets({ a: [{ b: `x ${secret} y` }] })).toEqual([secret]);
    expect(containsSecret({ pub: Keypair.random().publicKey(), note: "S" + "A".repeat(55) })).toBe(false);
    expect(() => assertNoSecret({ secret }, "record")).toThrow(/secret seed/);
    expect(() => assertNoSecret({ ok: true })).not.toThrow();
  });
});

describe("landing account secret hygiene", () => {
  it("returns a plan and logs that never contain the landing secret, and wipes the key in place", async () => {
    const landing = Keypair.random();
    const secret = landing.secret();
    const seed = Buffer.from(landing.rawSecretKey());
    const fake = fakeDeps(() => landing);

    const plan = await createLandingAccount(fake.deps, onramp());

    expect(JSON.stringify(plan)).not.toContain(secret);
    expect(containsSecret(plan)).toBe(false);
    expect(containsSecret(fake.logs)).toBe(false);
    expect(fake.logs.join("\n")).toContain(landing.publicKey());
    // Wiped in place: the seed buffers are zero and the object no longer yields the secret.
    expect([...landing.rawSecretKey()].every((b) => b === 0)).toBe(true);
    expect(landing.secret()).not.toBe(secret);
    expect(seed.equals(landing.rawSecretKey())).toBe(false);
    // Nothing sent to the network or the relay carries it either.
    expect(containsSecret(fake.submitted.map((t) => t.toXDR()))).toBe(false);
    expect(containsSecret(fake.relayed)).toBe(false);
  });

  it("does not retain the landing keypair after returning", async () => {
    let ref: WeakRef<Keypair> | null = null;
    const fake = fakeDeps(() => {
      const kp = Keypair.random();
      ref = new WeakRef(kp);
      return kp;
    });
    const plan = await createLandingAccount(fake.deps, onramp());
    expect(plan.publicKey).toMatch(/^G/);
    const gc = (globalThis as { gc?: () => void }).gc;
    if (!gc) {
      throw new Error("run the tests with node --expose-gc (pnpm test) so this assertion can force a collection");
    }
    // A WeakRef target stays alive until the end of the job that created or
    // dereferenced it, so leave this job, collect, and only then dereference.
    await new Promise((r) => setTimeout(r, 0));
    gc();
    await new Promise((r) => setTimeout(r, 0));
    gc();
    expect(ref!.deref()).toBeUndefined();
  });

  it("wipeKeypair zeroes both secret buffers", () => {
    const kp = Keypair.random();
    const before = kp.secret();
    wipeKeypair(kp);
    expect(kp.secret()).not.toBe(before);
    expect([...kp.rawSecretKey()].every((b) => b === 0)).toBe(true);
  });
});

describe("landing account pre-lock hook (SEP-6 path)", () => {
  it("lets the anchor conversation sign one challenge before the lock, builds the envelopes for the kind it returns, and pre-authorizes an abort at seq+1", async () => {
    const landing = Keypair.random();
    const fake = fakeDeps(() => landing);
    const sequences: string[] = [];
    let seen = "";
    const plan = await createLandingAccount(fake.deps, {
      usdc: USDC,
      usdcContract: USDC_SAC,
      abortable: true,
      beforeLock: async (bridge) => {
        seen = bridge.publicKey;
        // A SEP-10 challenge: sequence 0, signed by the anchor, naming the bridge in a manage-data op.
        const anchor = Keypair.random();
        const challenge = new TransactionBuilder(new Account(anchor.publicKey(), "-1"), { fee: "100", networkPassphrase: PASSPHRASE })
          .addOperation(Operation.manageData({ name: "example.com auth", value: Buffer.alloc(48, 1), source: bridge.publicKey }))
          .setTimeout(300)
          .build();
        bridge.sign(challenge);
        sequences.push(challenge.sequence);
        expect(challenge.signatures.length).toBe(1);
        // Anything with a real sequence number must be refused.
        const notAChallenge = new TransactionBuilder(new Account(bridge.publicKey, "5"), { fee: "100", networkPassphrase: PASSPHRASE }).addOperation(Operation.manageData({ name: "x", value: null })).setTimeout(300).build();
        expect(() => bridge.sign(notAChallenge)).toThrow(/sequence 0/);
        return { type: "onramp", destinationContract: SMART_ACCOUNT, amountStroops: 20_533_494n };
      },
    });
    expect(seen).toBe(landing.publicKey());
    expect(sequences).toEqual(["0"]);
    expect(plan.challengesSigned).toBe(1);
    expect(plan.amountStroops).toBe("20533494");
    expect(plan.kind).toBe("onramp");
    expect(plan.abortTxXdr).toBeDefined();
    const forward = TransactionBuilder.fromXDR(plan.forwardTxXdr, PASSPHRASE) as Transaction;
    const abort = TransactionBuilder.fromXDR(plan.abortTxXdr!, PASSPHRASE) as Transaction;
    const cleanup = TransactionBuilder.fromXDR(plan.cleanupTxXdr, PASSPHRASE) as Transaction;
    expect(abort.sequence).toBe(forward.sequence);
    expect(BigInt(cleanup.sequence)).toBe(BigInt(forward.sequence) + 1n);
    expect(abort.operations.map((o) => o.type)).toEqual(["changeTrust", "accountMerge"]);
    const lockTx = fake.submitted.find((t) => t.operations.some((o) => o.type === "setOptions"))!;
    const preauth = lockTx.operations.filter((o) => o.type === "setOptions" && "signer" in o && o.signer && "preAuthTx" in o.signer) as Array<{ signer: { preAuthTx: Buffer; weight: number } }>;
    expect(preauth.map((o) => Buffer.from(o.signer.preAuthTx).toString("hex")).sort()).toEqual([forward.hash(), cleanup.hash(), abort.hash()].map((h) => h.toString("hex")).sort());
    expect(containsSecret(plan)).toBe(false);
    expect([...landing.rawSecretKey()].every((b) => b === 0)).toBe(true);
  });

  it("merges the bridge back when the anchor refuses before the lock", async () => {
    const landing = Keypair.random();
    const fake = fakeDeps(() => landing);
    await expect(
      createLandingAccount(fake.deps, {
        usdc: USDC,
        usdcContract: USDC_SAC,
        beforeLock: async () => {
          throw new Error("SEP-10 token: challenge verification failed");
        },
      }),
    ).rejects.toThrow(/SEP-10/);
    const undo = fake.submitted.at(-1)!;
    expect(undo.operations.map((o) => o.type)).toEqual(["changeTrust", "accountMerge"]);
    expect(fake.submitted.some((t) => t.operations.some((o) => o.type === "setOptions"))).toBe(false);
    expect([...landing.rawSecretKey()].every((b) => b === 0)).toBe(true);
  });
});

describe("landing account lock invariants", () => {
  it("locks with two pre-authorized signers of weight 1, master weight 1 and thresholds 2, at seq+1 and seq+2", async () => {
    const fake = fakeDeps();
    const plan = await createLandingAccount(fake.deps, onramp());
    const [createTx, lockTx] = fake.submitted;
    expect(createTx).toBeDefined();
    expect(lockTx).toBeDefined();

    // Creation: sponsored, zero starting balance, trustline from the landing account.
    const createOps = createTx!.operations.map((o) => o.type);
    expect(createOps).toEqual(["beginSponsoringFutureReserves", "createAccount", "changeTrust", "endSponsoringFutureReserves"]);
    const createAccountOp = createTx!.operations[1] as { startingBalance: string; destination: string };
    expect(createAccountOp.startingBalance).toBe("0.0000000");
    expect(createAccountOp.destination).toBe(plan.publicKey);

    // Lock: exactly the signer/threshold scheme from the threat model.
    const lockOps = lockTx!.operations;
    expect(lockOps.map((o) => o.type)).toEqual(["beginSponsoringFutureReserves", "setOptions", "setOptions", "setOptions", "endSponsoringFutureReserves"]);
    const forward = TransactionBuilder.fromXDR(plan.forwardTxXdr, PASSPHRASE) as Transaction;
    const cleanup = TransactionBuilder.fromXDR(plan.cleanupTxXdr, PASSPHRASE) as Transaction;
    const signer1 = (lockOps[1] as { signer: { preAuthTx: Buffer; weight: number } }).signer;
    const signer2 = (lockOps[2] as { signer: { preAuthTx: Buffer; weight: number } }).signer;
    expect(Buffer.from(signer1.preAuthTx).equals(forward.hash())).toBe(true);
    expect(signer1.weight).toBe(1);
    expect(Buffer.from(signer2.preAuthTx).equals(cleanup.hash())).toBe(true);
    expect(signer2.weight).toBe(1);
    const thresholds = lockOps[3] as { masterWeight: number; lowThreshold: number; medThreshold: number; highThreshold: number };
    expect(thresholds).toMatchObject({ masterWeight: 1, lowThreshold: 2, medThreshold: 2, highThreshold: 2 });

    // The landing key signs exactly four envelopes: creation, lock, forward, cleanup.
    const landingHint = Keypair.fromPublicKey(plan.publicKey).signatureHint();
    const hintsOf = (tx: Transaction) => tx.signatures.map((sig) => Buffer.from(sig.hint()));
    const signedByLanding = (tx: Transaction) => hintsOf(tx).filter((h) => h.equals(landingHint)).length;
    expect(signedByLanding(createTx!)).toBe(1);
    expect(signedByLanding(lockTx!)).toBe(1);
    expect(signedByLanding(forward)).toBe(1);
    expect(signedByLanding(cleanup)).toBe(1);
    expect(createTx!.signatures.length).toBe(2);
    expect(lockTx!.signatures.length).toBe(2);
    expect(fake.submitted.length).toBe(2);

    // Sequence numbers, co-signatures, no time bounds, forward fee = resource fee + base fee.
    const landingSeq = BigInt((await fake.deps.server.getAccount(plan.publicKey)).sequenceNumber());
    expect(BigInt(forward.sequence)).toBe(landingSeq + 1n);
    expect(BigInt(cleanup.sequence)).toBe(landingSeq + 2n);
    expect(forward.toEnvelope().v1().signatures().length).toBe(1);
    expect(cleanup.toEnvelope().v1().signatures().length).toBe(1);
    expect(forward.timeBounds?.maxTime ?? "0").toBe("0");
    expect(cleanup.timeBounds?.maxTime ?? "0").toBe("0");
    const resourceFee = forward.toEnvelope().v1().tx().ext().sorobanData()!.resourceFee().toBigInt();
    expect(BigInt(forward.fee)).toBe(resourceFee + 100n);
    expect(forward.source).toBe(plan.publicKey);
    expect(cleanup.operations.map((o) => o.type)).toEqual(["changeTrust", "accountMerge"]);
    expect((cleanup.operations[1] as { destination: string }).destination).toBe(fake.deps.sponsor.publicKey());
  });

  it("builds a classic payment with the anchor's memo id for withdrawals", async () => {
    const fake = fakeDeps();
    const treasury = Keypair.random().publicKey();
    const plan = await createLandingAccount(fake.deps, {
      usdc: USDC,
      usdcContract: USDC_SAC,
      kind: { type: "offramp", treasury, memoId: "415114909797", amountStroops: 20_000_000n },
    });
    const forward = TransactionBuilder.fromXDR(plan.forwardTxXdr, PASSPHRASE) as Transaction;
    expect(forward.operations.map((o) => o.type)).toEqual(["payment"]);
    expect((forward.operations[0] as { destination: string; amount: string }).destination).toBe(treasury);
    expect((forward.operations[0] as { amount: string }).amount).toBe("2.0000000");
    expect(forward.memo.type).toBe("id");
    expect(String(forward.memo.value)).toBe("415114909797");
  });

  it("submits pre-authorized envelopes through the relay first", async () => {
    const fake = fakeDeps();
    const plan = await createLandingAccount(fake.deps, onramp());
    const result = await submitPreauthorized(fake.deps, plan.forwardTxXdr);
    expect(result.via).toBe("relay");
    expect(result.hash).toBe(plan.forwardTxHash);
    expect(fake.relayed).toHaveLength(1);
    expect(xdr.TransactionEnvelope.fromXDR(fake.relayed[0]!, "base64").v1().signatures().length).toBe(1);
  });
});
