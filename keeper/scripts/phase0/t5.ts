/**
 * Phase-0 T5: agent-signed XOXNO calls, no router, passkey forbidden.
 *   (1) controller.withdraw(wallet, id, [(hub1 USDC, x)], Some(wallet))   agent key, rule 1 pinned per context
 *   (2) controller.supply(wallet, id, 3, [(hub2 USDC, x)])                agent key, rule 1 pinned per context
 * Soroban allows one InvokeHostFunction per tx, so these are two transactions; T6 makes them atomic via the router.
 * Logs every auth entry the smart account receives (root fn + sub-invocations).
 *   pnpm tsx scripts/phase0/t5.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Address, BASE_FEE, Contract, Keypair, TransactionBuilder, contract, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { SoftwareAuthenticator, type AuthenticatorState } from "../../src/phase0/passkey";

const TESTNET = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash: "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
  webauthnVerifierAddress: "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F",
  ed25519VerifierAddress: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
} as const;
const XOXNO = {
  controller: "CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3",
  pool: "CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  spoke: 3,
} as const;
const RP_ID = "niet.local";
const ORIGIN = "https://niet.local";
const STATE_PATH = fileURLToPath(new URL("../../.phase0-state.json", import.meta.url));

interface State { contractId?: string; passkey?: AuthenticatorState; ruleId?: number; t4?: { accountId?: string }; t5?: { amount?: string; withdrawHash?: string; supplyHash?: string; withdrawEntries?: string[]; supplyEntries?: string[] } }
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
const state: State = existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) : {};
if (!state.contractId || !state.passkey || state.ruleId === undefined || !state.t4?.accountId) throw new Error("run t1-t3.ts and t4.ts first");
const wallet = state.contractId;
const accountId = BigInt(state.t4.accountId);
const ruleId = state.ruleId;
state.t5 ??= {};
const t5 = state.t5;
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const step = (s: string) => console.log(`\n== ${s}`);
const server = new rpc.Server(TESTNET.rpcUrl);

class ForbiddenAuthenticator extends SoftwareAuthenticator {
  override async startAuthentication(): Promise<never> { throw new Error("PASSKEY WAS TOUCHED: T5 must be agent-only"); }
}
const kit = new SmartAccountKit({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
  webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
  storage: new MemoryStorage(), rpId: RP_ID, rpName: "Niet",
  webAuthn: new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey) as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
  deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
});
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
kit.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
const selected = kit.multiSigners.buildSelectedSigners(await kit.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
if (selected.length !== 1) throw new Error("expected one ed25519 signer");
const controller = await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
type Ctrl = { withdraw: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>; supply: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>> };
const ctrl = controller as unknown as Ctrl;

function describeEntries(tx: contract.AssembledTransaction<unknown>): string[] {
  const op = tx.built?.operations[0];
  const entries = op && "auth" in op ? (op as { auth: xdr.SorobanAuthorizationEntry[] }).auth : [];
  const walk = (inv: xdr.SorobanAuthorizedInvocation, depth: number): string[] => {
    const f = inv.function();
    const line = f.switch().name === "sorobanAuthorizedFunctionTypeContractFn"
      ? `${"  ".repeat(depth)}${Address.fromScAddress(f.contractFn().contractAddress()).toString().slice(0, 8)}.${f.contractFn().functionName().toString()}`
      : `${"  ".repeat(depth)}<create>`;
    return [line, ...inv.subInvocations().flatMap((s) => walk(s, depth + 1))];
  };
  return entries.map((e) => {
    const cred = e.credentials().switch().name;
    const who = cred === "sorobanCredentialsAddress" ? Address.fromScAddress(e.credentials().address().address()).toString().slice(0, 8) : "source";
    return `[${who}] ` + walk(e.rootInvocation(), 0).join(" > ");
  });
}

function countContexts(inv: xdr.SorobanAuthorizedInvocation): number {
  return 1 + inv.subInvocations().reduce((acc, sub) => acc + countContexts(sub), 0);
}

async function agentSubmit(tx: contract.AssembledTransaction<unknown>, label: string) {
  const contexts: number[] = [];
  const res = await kit.multiSigners.operation(tx, selected, {
    forceMethod: "rpc",
    onLog: (m, t) => console.log(`  [${t ?? "info"}] ${m}`),
    resolveContextRuleIds: (entry, i) => { const n = countContexts(entry.rootInvocation()); contexts.push(n); return Array<number>(n).fill(ruleId); },
  });
  console.log(`${label}: entries=${contexts.length}, contexts per entry=${json(contexts)} (rule ${ruleId} each) -> ${json({ success: res.success, hash: res.hash, error: res.error })}`);
  if (!res.success) throw new Error(`${label} failed`);
  return res.hash!;
}

async function positions() {
  const c = new Contract(XOXNO.controller);
  const acc = await server.getAccount(keeper.publicKey());
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(c.call("get_account_positions", nativeToScVal(accountId, { type: "u64" }))).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("positions sim failed");
  const coll = sim.result!.retval.vec()![0]!.map() ?? [];
  const out: Record<string, string> = {};
  for (const entry of coll) {
    const key = Object.fromEntries(entry.key().map()!.map((kv) => [kv.key().sym().toString(), scValToNative(kv.val())])) as { hub_id: number };
    const val = Object.fromEntries(entry.val().map()!.map((kv) => [kv.key().sym().toString(), scValToNative(kv.val())])) as { scaled_amount: bigint };
    out[`hub${key.hub_id}`] = (Number(val.scaled_amount) / 1e27).toFixed(7);
  }
  return out;
}

step("positions before");
console.log(json(await positions()));
const hub1 = { asset: XOXNO.usdc, hub_id: 1 };
const hub2 = { asset: XOXNO.usdc, hub_id: 2 };
const amount = 20_0000000n;
t5.amount = amount.toString(); save();

if (!t5.withdrawHash) {
  step("(1) agent-signed controller.withdraw hub1 -> wallet");
  const tx = await ctrl.withdraw({ caller: wallet, account_id: accountId, withdrawals: [[hub1, amount]], to: wallet });
  t5.withdrawEntries = describeEntries(tx); save();
  console.log(t5.withdrawEntries.join("\n"));
  t5.withdrawHash = await agentSubmit(tx, "withdraw"); save();
}
if (!t5.supplyHash) {
  step("(2) agent-signed controller.supply wallet -> hub2");
  const tx = await ctrl.supply({ caller: wallet, account_id: accountId, spoke_id: XOXNO.spoke, assets: [[hub2, amount]] });
  t5.supplyEntries = describeEntries(tx); save();
  console.log(t5.supplyEntries.join("\n"));
  t5.supplyHash = await agentSubmit(tx, "supply"); save();
}

step("positions after");
console.log(json(await positions()));
console.log(`\nT5 state: ${json(t5)}`);
