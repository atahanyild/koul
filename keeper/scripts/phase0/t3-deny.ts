/**
 * Phase-0 T3 negative: same agent key, same transfer, but pinned to a rule whose policy denies everything.
 * Adds a second Default rule "niet-agent-deny" (agent signer + deny_policy), then:
 *   (1) transfer pinned to the deny rule  -> must FAIL
 *   (2) transfer pinned to the noop rule  -> must SUCCEED (control)
 *   pnpm tsx scripts/phase0/t3-deny.ts
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

interface State { contractId?: string; passkey?: AuthenticatorState; ruleId?: number; denyRuleId?: number; denyRuleHash?: string; t3DenyError?: string; t3ControlHash?: string }

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(fileURLToPath(new URL("../../.env", import.meta.url)), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}
const env = loadEnv();
const keeper = Keypair.fromSecret(env.KEEPER_SECRET!);
const agent = Keypair.fromSecret(env.AGENT_SECRET!);
const state: State = existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) : {};
if (!state.contractId || !state.passkey || state.ruleId === undefined) throw new Error("run t1-t3.ts first");
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const step = (s: string) => console.log(`\n== ${s}`);

function makeKit(authenticator: SoftwareAuthenticator): SmartAccountKit {
  return new SmartAccountKit({
    rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
    webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
    storage: new MemoryStorage(), rpId: RP_ID, rpName: "Niet",
    webAuthn: authenticator as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
    deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
  });
}
class ForbiddenAuthenticator extends SoftwareAuthenticator {
  override async startAuthentication(): Promise<never> { throw new Error("PASSKEY WAS TOUCHED"); }
}

step("install niet-agent-deny rule with the passkey");
const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const kit = makeKit(authenticator);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: state.contractId });
let rules = await kit.rules.list();
let deny = rules.find((r) => r.name === "niet-agent-deny");
if (!deny) {
  const ledger = (await kit.rpc.getLatestLedger()).sequence;
  const signer = createEd25519Signer(TESTNET.ed25519VerifierAddress, agent.rawPublicKey());
  const tx = await kit.rules.add(createDefaultContext(), "niet-agent-deny", [signer], new Map([[env.DENY_POLICY!, xdr.ScVal.scvVoid()]]), ledger + 17280);
  const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
  state.passkey = authenticator.toState(); save();
  if (!res.success) throw new Error(`rules.add failed: ${json(res)}`);
  state.denyRuleHash = res.hash;
  rules = await kit.rules.list();
  deny = rules.find((r) => r.name === "niet-agent-deny");
  if (!deny) throw new Error("deny rule missing after add");
  console.log(`deny rule added, tx ${res.hash}`);
}
state.denyRuleId = Number(deny.id); save();
console.log(`rules: ${rules.map((r) => `${r.id}:${r.name}`).join(", ")}`);

async function agentTransfer(pinRule: number) {
  const k = makeKit(new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey));
  await k.connectWallet({ credentialId: state.passkey!.credentialId, contractId: state.contractId! });
  k.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
  const selected = k.multiSigners.buildSelectedSigners(await k.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
  return k.multiSigners.transfer(TESTNET.xlmSac, keeper.publicKey(), 1, selected, { forceMethod: "rpc", resolveContextRuleIds: () => [pinRule] });
}

step(`(1) agent transfer pinned to deny rule ${state.denyRuleId} - expect failure`);
try {
  const r = await agentTransfer(state.denyRuleId);
  console.log(`result: ${json({ success: r.success, hash: r.hash, error: r.error })}`);
  if (r.success) throw new Error("DENY RULE DID NOT BLOCK THE TRANSFER");
  state.t3DenyError = String(r.error ?? "failed");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("DENY RULE DID NOT")) throw err;
  console.log(`rejected as expected: ${msg.slice(0, 400)}`);
  state.t3DenyError = msg.slice(0, 400);
}
save();

step(`(2) control: same transfer pinned to noop rule ${state.ruleId} - expect success`);
const ok = await agentTransfer(state.ruleId);
console.log(`result: ${json({ success: ok.success, hash: ok.hash, error: ok.error })}`);
if (!ok.success) throw new Error("control transfer failed");
state.t3ControlHash = ok.hash; save();
console.log("\nT3 negative + control: PASS");
