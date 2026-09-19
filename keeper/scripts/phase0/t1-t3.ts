/**
 * Phase-0 T1-T3, headless.
 *
 * T1: create a smart account (software passkey, keeper pays the deploy), fund it, dump its rules.
 * T2: add the "niet-agent" Default rule: one Ed25519 external signer (the agent key) + noop policy, 1-day expiry.
 * T3: with ONLY the agent key (the passkey authenticator throws if touched), transfer 1 XLM from the
 *     smart account to the keeper G-address, pinning the niet-agent rule id per auth context.
 *
 * State is kept in keeper/.phase0-state.json (gitignored) so the same wallet is reused on re-runs.
 *   pnpm tsx scripts/phase0/t1-t3.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Keypair, xdr } from "@stellar/stellar-sdk";
import { MemoryStorage, SmartAccountKit, createDefaultContext, createEd25519Signer } from "smart-account-kit";
import { SoftwareAuthenticator, type AuthenticatorState } from "../../src/phase0/passkey";

const TESTNET = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash: "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
  webauthnVerifierAddress: "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F",
  ed25519VerifierAddress: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
  xlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;
const RP_ID = "niet.local";
const ORIGIN = "https://niet.local";
const STATE_PATH = fileURLToPath(new URL("../../.phase0-state.json", import.meta.url));
const LEDGERS_PER_DAY = 17280;

interface State {
  contractId?: string;
  passkey?: AuthenticatorState;
  deployHash?: string;
  fundHash?: string;
  ruleId?: number;
  ruleHash?: string;
  t3Hash?: string;
}

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const path = fileURLToPath(new URL("../../.env", import.meta.url));
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

const env = loadEnv();
const keeper = Keypair.fromSecret(env.KEEPER_SECRET!);
const agent = Keypair.fromSecret(env.AGENT_SECRET!);
const NOOP_POLICY = env.NOOP_POLICY!;

const state: State = existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) : {};
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const step = (s: string) => console.log(`\n== ${s}`);

function makeKit(authenticator: SoftwareAuthenticator): SmartAccountKit {
  return new SmartAccountKit({
    rpcUrl: TESTNET.rpcUrl,
    networkPassphrase: TESTNET.networkPassphrase,
    accountWasmHash: TESTNET.accountWasmHash,
    webauthnVerifierAddress: TESTNET.webauthnVerifierAddress,
    ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
    storage: new MemoryStorage(),
    rpId: RP_ID,
    rpName: "Niet",
    webAuthn: authenticator as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
    deployerSecret: env.KEEPER_SECRET!,
    timeoutInSeconds: 60,
  });
}

/** An authenticator that proves the passkey was never consulted. */
class ForbiddenAuthenticator extends SoftwareAuthenticator {
  override async startAuthentication(): Promise<never> {
    throw new Error("PASSKEY WAS TOUCHED: T3 must be agent-only");
  }
  override async startRegistration(): Promise<never> {
    throw new Error("PASSKEY WAS TOUCHED: T3 must be agent-only");
  }
}

async function t1(): Promise<{ kit: SmartAccountKit; authenticator: SoftwareAuthenticator }> {
  step("T1 smart account");
  console.log(`keeper (deployer, fee payer): ${keeper.publicKey()}`);
  console.log(`agent pubkey: ${agent.publicKey()}`);
  if (state.contractId && state.passkey) {
    const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
    const kit = makeKit(authenticator);
    const c = await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: state.contractId });
    if (!c) throw new Error("connectWallet returned null");
    console.log(`reconnected ${c.contractId}`);
    return { kit, authenticator };
  }
  const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN);
  const kit = makeKit(authenticator);
  const created = await kit.createWallet("Niet", `phase0-${Date.now()}`, { autoSubmit: true, forceMethod: "rpc" });
  if (!created.submitResult?.success) throw new Error(`deploy failed: ${json(created.submitResult)}`);
  state.contractId = created.contractId;
  state.deployHash = created.submitResult.hash;
  state.passkey = authenticator.toState();
  save();
  console.log(`created ${created.contractId} tx ${created.submitResult.hash}`);
  const funded = await kit.fundWallet(TESTNET.xlmSac, { forceMethod: "rpc" });
  state.fundHash = funded.hash;
  state.passkey = authenticator.toState();
  save();
  console.log(`funded: ${json({ success: funded.success, amount: funded.amount, hash: funded.hash, error: funded.error })}`);
  return { kit, authenticator };
}

async function dumpRules(kit: SmartAccountKit, label: string) {
  const rules = await kit.rules.list();
  console.log(`${label}: ${rules.length} rule(s)`);
  for (const r of rules) {
    console.log(json({ id: r.id, name: r.name, context_type: r.context_type, valid_until: r.valid_until, signers: r.signers, policies: r.policies }));
  }
  return rules;
}

async function t2(kit: SmartAccountKit, authenticator: SoftwareAuthenticator): Promise<number> {
  step("T2 add niet-agent rule (Ed25519 external signer + noop policy)");
  const before = await dumpRules(kit, "rules before");
  const existing = before.find((r) => r.name === "niet-agent");
  if (existing) {
    console.log(`niet-agent already installed as rule ${existing.id}`);
    state.ruleId = Number(existing.id);
    save();
    return state.ruleId;
  }
  const ledger = (await kit.rpc.getLatestLedger()).sequence;
  const signer = createEd25519Signer(TESTNET.ed25519VerifierAddress, agent.rawPublicKey());
  const tx = await kit.rules.add(createDefaultContext(), "niet-agent", [signer], new Map([[NOOP_POLICY, xdr.ScVal.scvVoid()]]), ledger + LEDGERS_PER_DAY);
  const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
  state.passkey = authenticator.toState();
  save();
  if (!res.success) throw new Error(`rules.add failed: ${json(res)}`);
  console.log(`rules.add tx ${res.hash}`);
  state.ruleHash = res.hash;
  const after = await dumpRules(kit, "rules after");
  const rule = after.find((r) => r.name === "niet-agent");
  if (!rule) throw new Error("niet-agent rule not found after add");
  state.ruleId = Number(rule.id);
  save();
  return state.ruleId;
}

async function t3(ruleId: number) {
  step("T3 agent-only transfer of 1 XLM to the keeper (passkey forbidden)");
  const kit = makeKit(new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey));
  const c = await kit.connectWallet({ credentialId: state.passkey!.credentialId, contractId: state.contractId! });
  if (!c) throw new Error("connectWallet returned null");
  kit.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
  const available = await kit.multiSigners.getAvailableSigners();
  const selected = kit.multiSigners.buildSelectedSigners(available, null).filter((s) => s.type === "ed25519");
  console.log(`selected signers: ${json(selected)}`);
  if (selected.length !== 1) throw new Error("expected exactly one ed25519 selected signer");
  const contexts: number[] = [];
  const result = await kit.multiSigners.transfer(TESTNET.xlmSac, keeper.publicKey(), 1, selected, {
    forceMethod: "rpc",
    onLog: (m, t) => console.log(`  [${t ?? "info"}] ${m}`),
    resolveContextRuleIds: (_entry, index) => {
      contexts.push(index);
      return [ruleId];
    },
  });
  console.log(`auth contexts signed: ${contexts.length}, rule id pinned: ${ruleId}`);
  console.log(`result: ${json({ success: result.success, hash: result.hash, error: result.error })}`);
  if (!result.success) throw new Error("T3 transfer failed");
  state.t3Hash = result.hash;
  save();
  const tx = await kit.rpc.getTransaction(result.hash!);
  console.log(`tx status: ${tx.status}`);
  const meta = (tx as { resultMetaXdr?: xdr.TransactionMeta }).resultMetaXdr;
  if (meta) {
    const events = meta.switch() === 4
      ? (meta.value() as xdr.TransactionMetaV4).events?.() ?? []
      : meta.switch() === 3
        ? (meta.value() as xdr.TransactionMetaV3).sorobanMeta()?.events() ?? []
        : [];
    console.log(`transaction-level events: ${events.length}`);
  }
  const from = (await kit.rpc.getLatestLedger()).sequence - 200;
  const ev = await kit.rpc.getEvents({ startLedger: from, filters: [{ type: "contract", contractIds: [NOOP_POLICY] }], limit: 50 });
  console.log(`noop policy events in last 200 ledgers: ${ev.events.length}`);
  for (const e of ev.events.slice(-5)) {
    console.log(json({ ledger: e.ledger, tx: e.txHash, topics: e.topic.map((t) => t.toXDR("base64")), value: e.value.toXDR("base64") }));
  }
}

const { kit, authenticator } = await t1();
const ruleId = await t2(kit, authenticator);
await t3(ruleId);
console.log(`\nstate: ${json(state)}`.replace(/"privateKeyPem": "[^"]*"/, '"privateKeyPem": "<redacted>"'));
