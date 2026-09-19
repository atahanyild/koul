/**
 * Phase-0 revoke: remove the probe rules (noop 1, deny 2, expiring 4) with the passkey, then prove the agent key can no longer act under them.
 *   (1) controller.withdraw(wallet, id, [(hub1 USDC, x)], Some(wallet))   agent key, rule 1 pinned per context
 *   (2) controller.supply(wallet, id, 3, [(hub2 USDC, x)])                agent key, rule 1 pinned per context
 * Soroban allows one InvokeHostFunction per tx, so these are two transactions; T6 makes them atomic via the router.
 * Logs every auth entry the smart account receives (root fn + sub-invocations).
 *   pnpm tsx scripts/phase0/t5.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Address, BASE_FEE, Contract, Keypair, TransactionBuilder, contract, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { MemoryStorage, SmartAccountKit, createDefaultContext, createEd25519Signer } from "smart-account-kit";
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

interface State { contractId?: string; passkey?: AuthenticatorState; ruleId?: number; t4?: { accountId?: string }; t7?: Record<string, unknown>; revoke?: Record<string, unknown>; t5?: { amount?: string; withdrawHash?: string; supplyHash?: string; withdrawEntries?: string[]; supplyEntries?: string[] } }
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
state.revoke ??= {};
const t7 = state.revoke;
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
let lastSimError = "";
{
  const orig = kit.rpc.simulateTransaction.bind(kit.rpc);
  (kit.rpc as { simulateTransaction: typeof orig }).simulateTransaction = async (...a: Parameters<typeof orig>) => {
    const r = await orig(...a);
    if (rpc.Api.isSimulationError(r)) lastSimError = r.error;
    return r;
  };
}
const decodeSim = (e: string): string => {
  const codes = [...new Set((e.match(/Error\(Contract, #(\d+)\)/g) ?? []))].join(",");
  const names: Record<string, string> = { "7102": "NotContractContext", "7103": "CallNotAllowed", "7104": "TransferRecipientNotAllowed", "7105": "TransferArity", "7106": "RateLimited", "3002": "UnvalidatedContext(smart account)", "3014": "ContextRuleIdsLengthMismatch" };
  const named = codes.split(",").map((c) => `${c}=${names[c.match(/\d+/)?.[0] ?? ""] ?? "?"}`).join(" ");
  return `${named} | ${e.replace(/\s+/g, " ").slice(0, 260)}`;
};
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

async function agentSubmit(tx: contract.AssembledTransaction<unknown>, label: string, pin: number) {
  const contexts: number[] = [];
  lastSimError = "";
  const res = await kit.multiSigners.operation(tx, selected, {
    forceMethod: "rpc",
    onLog: (m, t) => console.log(`  [${t ?? "info"}] ${m}`),
    resolveContextRuleIds: (entry, i) => { const n = countContexts(entry.rootInvocation()); contexts.push(n); return Array<number>(n).fill(pin); },
  });
  const err = res.error as { context?: { contractErrorName?: string; contractCode?: number; diagnostic?: string } } | undefined;
  const short = err?.context ? `${err.context.contractErrorName ?? ""}#${err.context.contractCode ?? ""} ${(err.context.diagnostic ?? "").match(/Error\(Contract, #(\d+)\)/g)?.join(",") ?? ""}` : res.error ? json(res.error).slice(0, 200) : "";
  console.log(`${label}: contexts=${json(contexts)} rule ${pin} -> ${res.success ? `SUCCESS ${res.hash}` : `FAILED ${short}`}`);
  if (!res.success && lastSimError) { console.log(`  diagnostic: ${decodeSim(lastSimError)}`); t7[`diag_${label}`] = decodeSim(lastSimError); }
  return res;
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



const ROUTER = env.ROUTER!;
const pk = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const pkKit = new SmartAccountKit({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
  webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
  storage: new MemoryStorage(), rpId: RP_ID, rpName: "Niet",
  webAuthn: pk as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
  deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
});
await pkKit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
step("rules before");
console.log((await pkKit.rules.list()).map((r) => `${r.id}:${r.name}`).join(", "));
for (const name of ["niet-agent-expiring", "niet-agent-deny", "niet-agent"]) {
  const r = (await pkKit.rules.list()).find((x) => x.name === name);
  if (!r) { console.log(`${name}: already gone`); continue; }
  const tx = await pkKit.rules.remove(Number(r.id));
  const res = await pkKit.signAndSubmit(tx, { forceMethod: "rpc" });
  state.passkey = pk.toState(); save();
  console.log(`remove ${name} (id ${r.id}): ${res.success ? `SUCCESS ${res.hash}` : `FAILED ${json(res.error).slice(0, 300)}`}`);
  t7[`remove_${name}`] = res.success ? res.hash : "failed"; save();
}
step("rules after");
console.log((await pkKit.rules.list()).map((r) => `${r.id}:${r.name}`).join(", "));

step("agent tick pinned to the removed rule 1 -> must fail");
const router = await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
const tx = await (router as unknown as { tick_force: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>> }).tick_force({ user: wallet, account_id: accountId, from_hub: 2, to_hub: 1, spoke_id: XOXNO.spoke, amount: 1_0000000n });
const r = await agentSubmit(tx, "tick-revoked", 1);
t7.afterRevoke = r.success ? `UNEXPECTED SUCCESS ${r.hash}` : "rejected"; save();
console.log(`\nrevoke state: ${json(t7)}`);
