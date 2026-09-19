/**
 * Phase-0 T7: real niet_agent_policy, positive tick + negatives (a) bad recipient (b) bad contract (c) expired rule (d) rate limit.
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

interface State { contractId?: string; passkey?: AuthenticatorState; ruleId?: number; t4?: { accountId?: string }; t7?: Record<string, unknown>; t5?: { amount?: string; withdrawHash?: string; supplyHash?: string; withdrawEntries?: string[]; supplyEntries?: string[] } }
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
state.t7 ??= {};
const t7 = state.t7;
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
    if (rpc.Api.isSimulationError(r)) lastSimError = ("error" in r ? r.error : undefined);
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
  const err = ("error" in res ? res.error : undefined) as { context?: { contractErrorName?: string; contractCode?: number; diagnostic?: string } } | undefined;
  const short = err?.context ? `${err.context.contractErrorName ?? ""}#${err.context.contractCode ?? ""} ${(err.context.diagnostic ?? "").match(/Error\(Contract, #(\d+)\)/g)?.join(",") ?? ""}` : ("error" in res ? res.error : undefined) ? json(("error" in res ? res.error : undefined)).slice(0, 200) : "";
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
const NIET_POLICY = env.NIET_POLICY!;
const XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const addr = (a: string) => new Address(a).toScVal();
function paramsScVal(p: { allowedCalls: [string, string][]; recipients: string[]; maxCalls: number; windowLedgers: number }): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym("allowed_calls"), val: xdr.ScVal.scvVec(p.allowedCalls.map(([c, f]) => xdr.ScVal.scvVec([addr(c), sym(f)]))) }),
    new xdr.ScMapEntry({ key: sym("allowed_transfer_recipients"), val: xdr.ScVal.scvVec(p.recipients.map(addr)) }),
    new xdr.ScMapEntry({ key: sym("max_calls_per_window"), val: xdr.ScVal.scvU32(p.maxCalls) }),
    new xdr.ScMapEntry({ key: sym("window_ledgers"), val: xdr.ScVal.scvU32(p.windowLedgers) }),
  ]);
}
const PARAMS = { allowedCalls: [[ROUTER, "tick_force"], [XOXNO.controller, "withdraw"], [XOXNO.controller, "supply"], [XOXNO.usdc, "transfer"]] as [string, string][], recipients: [XOXNO.pool], maxCalls: 5, windowLedgers: 2000 };

// passkey kit for rule installs
const pk = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const pkKit = new SmartAccountKit({
  rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
  webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
  storage: new MemoryStorage(), rpId: RP_ID, rpName: "Niet",
  webAuthn: pk as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
  deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
});
await pkKit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
const agentSigner = createEd25519Signer(TESTNET.ed25519VerifierAddress, Keypair.fromSecret(env.AGENT_SECRET!).rawPublicKey());
async function ensureRule(name: string, params: xdr.ScVal, validUntil: number): Promise<number> {
  const rules = await pkKit.rules.list();
  const found = rules.find((r) => r.name === name);
  if (found) { console.log(`rule ${name} exists: id ${found.id}`); return Number(found.id); }
  const tx = await pkKit.rules.add(createDefaultContext(), name, [agentSigner], new Map([[NIET_POLICY, params]]), validUntil);
  const res = await pkKit.signAndSubmit(tx, { forceMethod: "rpc" });
  state.passkey = pk.toState(); save();
  if (!res.success) throw new Error(`rules.add ${name} failed: ${json(("error" in res ? res.error : undefined)).slice(0, 600)}`);
  const after = await pkKit.rules.list();
  const r = after.find((x) => x.name === name)!;
  console.log(`rule ${name} added: id ${r.id}, tx ${res.hash}`);
  t7[`rule_${name}_tx`] = res.hash; save();
  return Number(r.id);
}

const ledger = (await server.getLatestLedger()).sequence;
step("install niet-agent-v1 (real policy, 1 day) and niet-agent-expiring (valid 4 ledgers)");
const mainRule = await ensureRule("niet-agent-v1", paramsScVal(PARAMS), ledger + 17280);
const expRule = await ensureRule("niet-agent-expiring", paramsScVal(PARAMS), ledger + 4);
t7.mainRule = mainRule; t7.expRule = expRule; save();
console.log((await pkKit.rules.list()).map((r) => `${r.id}:${r.name}:until=${r.valid_until ?? "-"}`).join(", "));

const router = await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
type Router = { tick_force: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>> };
const tick = (from: number, to: number, amt: bigint) => (router as unknown as Router).tick_force({ user: wallet, account_id: accountId, from_hub: from, to_hub: to, spoke_id: XOXNO.spoke, amount: amt });
function tokenTransfer(token: string, from: string, to: string, amount: bigint): Promise<contract.AssembledTransaction<null>> {
  return contract.AssembledTransaction.build<null>({
    method: "transfer", args: [addr(from), addr(to), nativeToScVal(amount, { type: "i128" })],
    contractId: token, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey(),
    parseResultXdr: () => null,
  });
}

step("positions before"); console.log(json(await positions()));

step("POSITIVE: tick_force hub1 -> hub2, 3 USDC, pinned to niet-agent-v1 (4 contexts, 4 enforce calls)");
let tx: contract.AssembledTransaction<unknown>;
if (typeof t7.positive === "string" && /^[0-9a-f]{64}$/.test(t7.positive)) console.log(`already passed: ${t7.positive}`);
else { tx = await tick(1, 2, 3_0000000n); console.log(describeEntries(tx).join("\n")); const pos = await agentSubmit(tx, "tick", mainRule); t7.positive = pos.success ? pos.hash : `FAILED ${json(("error" in pos ? pos.error : undefined)).slice(0, 300)}`; save(); }

step("(a) prep: make sure the wallet holds idle USDC (withdraw 1 USDC hub1 -> wallet under the noop rule)");
{
  const balTx = await contract.AssembledTransaction.build<bigint>({ method: "balance", args: [addr(wallet)], contractId: XOXNO.usdc, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey(), parseResultXdr: (v) => scValToNative(v) as bigint });
  console.log(`wallet idle USDC: ${balTx.result}`);
  if (balTx.result < 1_0000000n) {
    const ctrl = await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
    const w = await (ctrl as unknown as { withdraw: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>> }).withdraw({ caller: wallet, account_id: accountId, withdrawals: [[{ asset: XOXNO.usdc, hub_id: 1 }, 1_0000000n]], to: wallet });
    const r = await agentSubmit(w, "prep-withdraw", ruleId);
    if (!r.success) throw new Error("prep withdraw failed");
  }
}
step("(a) NEGATIVE: usdc.transfer wallet -> random G, pinned to niet-agent-v1");
const randomG = keeper.publicKey(); // an existing account with a USDC trustline that is NOT an allowed recipient
tx = await tokenTransfer(XOXNO.usdc, wallet, randomG, 1_0000000n); console.log(describeEntries(tx).join("\n"));
const a = await agentSubmit(tx, "transfer->random", mainRule); t7.neg_a = a.success ? `UNEXPECTED SUCCESS ${a.hash}` : "rejected"; save();

step("(b) NEGATIVE: xlm.transfer wallet -> pool (contract not allowlisted)");
tx = await tokenTransfer(XLM_SAC, wallet, XOXNO.pool, 1_0000000n); console.log(describeEntries(tx).join("\n"));
const b = await agentSubmit(tx, "xlm->pool", mainRule); t7.neg_b = b.success ? `UNEXPECTED SUCCESS ${b.hash}` : "rejected"; save();

step("(c) NEGATIVE: tick pinned to niet-agent-expiring after valid_until");
for (;;) { const now = (await server.getLatestLedger()).sequence; if (now > ledger + 4) break; console.log(`  waiting for ledger > ${ledger + 4} (now ${now})`); await new Promise((r) => setTimeout(r, 6000)); }
tx = await tick(1, 2, 1_0000000n);
const c = await agentSubmit(tx, "tick-expired", expRule); t7.neg_c = c.success ? `UNEXPECTED SUCCESS ${c.hash}` : "rejected"; save();

step("(d) NEGATIVE: second tick in the window (4 + 4 > max 5) pinned to niet-agent-v1");
tx = await tick(2, 1, 1_0000000n);
const d = await agentSubmit(tx, "tick-ratelimit", mainRule); t7.neg_d = d.success ? `UNEXPECTED SUCCESS ${d.hash}` : "rejected"; save();

step("positions after"); console.log(json(await positions()));
const pc = await contract.Client.from({ contractId: NIET_POLICY, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
const win = await (pc as unknown as { get_window: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>> }).get_window({ smart_account: wallet, context_rule_id: mainRule });
console.log(`policy window state for rule ${mainRule}: ${json(win.result)}`);
console.log(`\nT7 state: ${json(t7)}`);
