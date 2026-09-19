/**
 * Phase-0 T4: Circle testnet USDC into the smart account, then a passkey-signed XOXNO supply.
 *
 *  a. keeper G-account: USDC trustline, SEP-10 -> SEP-12 -> SEP-38 firm quote -> SEP-6 deposit-exchange
 *     -> sandbox bank transfer -> anchor pays USDC to the keeper (classic payment).
 *  b. SAC transfer keeper G -> smart account C.
 *  c. controller.supply(caller=wallet, 0, 3, [(hub1 USDC, amt)]) signed with the passkey; record account_id.
 *   pnpm tsx scripts/phase0/t4.ts [tryAmount]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Address, Asset, BASE_FEE, Contract, Keypair, Operation, TransactionBuilder, contract, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { SoftwareAuthenticator, type AuthenticatorState } from "../../src/phase0/passkey";
import { discoverAnchor } from "../../src/anchor/discovery";
import { fiatAsset, sep10Authenticate, sep12Register, sep38Quote, sep6DepositExchange, sep6SimulateBankTransfer, sep6Transaction, stellarAsset } from "../../src/anchor/sep";

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

interface State {
  contractId?: string; passkey?: AuthenticatorState;
  t4?: { trustlineHash?: string; quoteId?: string; quotedUsdc?: string; sep6Id?: string; anchorPayHash?: string; forwardHash?: string; forwardedUsdc?: string; supplyHash?: string; accountId?: string };
}
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
if (!state.contractId || !state.passkey) throw new Error("run t1-t3.ts first");
state.t4 ??= {};
const t4 = state.t4;
const save = () => writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const step = (s: string) => console.log(`\n== ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const server = new rpc.Server(TESTNET.rpcUrl);
const tryAmount = process.argv[2] ?? "2500";

async function submitClassic(build: (b: TransactionBuilder) => TransactionBuilder, label: string): Promise<string> {
  const acc = await server.getAccount(keeper.publicKey());
  const tx = build(new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase })).setTimeout(120).build();
  tx.sign(keeper);
  const sent = await server.sendTransaction(tx);
  if (sent.status !== "PENDING") throw new Error(`${label}: send ${sent.status} ${json(sent)}`);
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const r = await server.getTransaction(sent.hash);
    if (r.status === "SUCCESS") return sent.hash;
    if (r.status === "FAILED") throw new Error(`${label}: FAILED ${sent.hash}`);
  }
  throw new Error(`${label}: timeout ${sent.hash}`);
}

async function sacBalance(holder: string): Promise<bigint> {
  const c = new Contract(XOXNO.usdc);
  const acc = await server.getAccount(keeper.publicKey());
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(c.call("balance", new Address(holder).toScVal())).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error(`balance sim failed: ${json(sim)}`);
  return scValToNative(sim.result!.retval) as bigint;
}

// ---- a. anchor deposit to the keeper G-account ----------------------------
step("a. anchor discovery");
const anchor = await discoverAnchor("tr-mock-anchor.fly.dev");
const usdcAsset = new Asset(anchor.usdc.code, anchor.usdc.issuer);
console.log(json({ homeDomain: anchor.homeDomain, usdc: anchor.usdc, fiat: anchor.fiatCode, sep38: anchor.sep38, sep6: anchor.sep6 && { depositExchange: anchor.sep6.depositExchange, fundingMethods: anchor.sep6.deposit?.fundingMethods }, limits: anchor.limits }));
if (anchor.usdc.contractId !== XOXNO.usdc) throw new Error(`anchor USDC SAC ${anchor.usdc.contractId} != XOXNO USDC ${XOXNO.usdc}`);
console.log("anchor USDC SAC == XOXNO USDC SAC: no two-USDC seam");

const horizonAcc = (await (await fetch(`https://horizon-testnet.stellar.org/accounts/${keeper.publicKey()}`)).json()) as { balances: { asset_code?: string; asset_issuer?: string; balance: string }[] };
const hasTrust = horizonAcc.balances.some((b) => b.asset_code === anchor.usdc.code && b.asset_issuer === anchor.usdc.issuer);
if (!hasTrust) {
  step("a. keeper USDC trustline");
  t4.trustlineHash = await submitClassic((b) => b.addOperation(Operation.changeTrust({ asset: usdcAsset })), "changeTrust");
  save();
  console.log(`trustline tx ${t4.trustlineHash}`);
}

if (!t4.anchorPayHash) {
  step("a. SEP-10 / SEP-12 / SEP-38 / SEP-6 as the keeper G-account");
  const auth = await sep10Authenticate(anchor, keeper.publicKey(), (tx) => tx.sign(keeper));
  console.log(`sep10 token ok (exp ${auth.expiresAt})`);
  const kyc = await sep12Register(anchor, auth.token, { first_name: "Niet", last_name: "Keeper", email_address: "keeper@niet.local" });
  console.log(`sep12: ${json(kyc)}`);
  const deliveryMethod = anchor.sep38?.sellDeliveryMethods[0] ?? "bank_account";
  const quote = await sep38Quote(anchor, auth.token, { sellAsset: fiatAsset(anchor.fiatCode ?? "TRY"), buyAsset: stellarAsset(anchor.usdc.code, anchor.usdc.issuer), sellAmount: tryAmount, deliveryMethod, side: "sell" });
  console.log(`sep38 quote: ${json(quote)}`);
  t4.quoteId = quote.id; t4.quotedUsdc = quote.buyAmount; save();
  const type = anchor.sep6?.deposit?.fundingMethods[0] ?? "bank_account";
  const dep = await sep6DepositExchange(anchor, auth.token, { sourceAsset: fiatAsset(anchor.fiatCode ?? "TRY"), destinationAssetCode: anchor.usdc.code, amount: tryAmount, quoteId: quote.id, account: keeper.publicKey(), type });
  console.log(`sep6 deposit-exchange: ${json({ id: dep.id, instructions: dep.instructions })}`);
  t4.sep6Id = dep.id; save();
  const sim = await sep6SimulateBankTransfer(anchor, auth.token, dep.id);
  console.log(`simulate-bank-transfer: ${json(sim)}`);
  let tx = await sep6Transaction(anchor, auth.token, dep.id);
  for (let i = 0; i < 40 && tx.status !== "completed" && !/error|refunded|expired/.test(tx.status); i++) {
    await sleep(3000);
    tx = await sep6Transaction(anchor, auth.token, dep.id);
    console.log(`  sep6 status: ${tx.status}`);
  }
  console.log(`sep6 final: ${json({ status: tx.status, amountIn: tx.amountIn, amountOut: tx.amountOut, stellarTx: tx.stellarTransactionId })}`);
  if (tx.status !== "completed") throw new Error(`anchor did not complete: ${tx.status}`);
  t4.anchorPayHash = tx.stellarTransactionId ?? "completed"; save();
}

// ---- b. SAC transfer keeper G -> smart account --------------------------------
if (!t4.forwardHash) {
  step("b. SAC transfer keeper -> smart account");
  const keeperUsdc = await sacBalance(keeper.publicKey());
  console.log(`keeper USDC (SAC balance): ${keeperUsdc}`);
  if (keeperUsdc <= 0n) throw new Error("keeper holds no USDC");
  const c = new Contract(XOXNO.usdc);
  const acc = await server.getAccount(keeper.publicKey());
  const built = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase })
    .addOperation(c.call("transfer", new Address(keeper.publicKey()).toScVal(), new Address(state.contractId).toScVal(), nativeToScVal(keeperUsdc, { type: "i128" })))
    .setTimeout(120).build();
  const prepared = await server.prepareTransaction(built);
  prepared.sign(keeper);
  const sent = await server.sendTransaction(prepared);
  if (sent.status !== "PENDING") throw new Error(`forward send ${sent.status} ${json(sent)}`);
  let r = await server.getTransaction(sent.hash);
  for (let i = 0; i < 40 && r.status === "NOT_FOUND"; i++) { await sleep(1500); r = await server.getTransaction(sent.hash); }
  if (r.status !== "SUCCESS") throw new Error(`forward ${r.status} ${sent.hash}`);
  t4.forwardHash = sent.hash; t4.forwardedUsdc = keeperUsdc.toString(); save();
  console.log(`forward tx ${sent.hash}`);
}
const walletUsdc = await sacBalance(state.contractId);
console.log(`smart account USDC: ${walletUsdc} (${Number(walletUsdc) / 1e7})`);

// ---- c. passkey-signed controller.supply ------------------------------------
if (!t4.supplyHash) {
  step("c. controller.supply from the smart account (passkey)");
  const authenticator = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
  const kit = new SmartAccountKit({
    rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
    webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
    storage: new MemoryStorage(), rpId: RP_ID, rpName: "Niet",
    webAuthn: authenticator as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
    deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
  });
  await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: state.contractId });
  const controller = await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey() });
  const amount = walletUsdc;
  const hubKey = { asset: XOXNO.usdc, hub_id: 1 };
  const assembled = await (controller as unknown as { supply: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>> }).supply({ caller: state.contractId, account_id: 0n, spoke_id: XOXNO.spoke, assets: [[hubKey, amount]] });
  const entries = assembled.built?.operations[0] && "auth" in assembled.built.operations[0] ? (assembled.built.operations[0] as { auth: xdr.SorobanAuthorizationEntry[] }).auth : [];
  console.log(`auth entries after simulation: ${entries.length}`);
  for (const e of entries) {
    const cred = e.credentials().switch().name;
    const addr = cred === "sorobanCredentialsAddress" ? Address.fromScAddress(e.credentials().address().address()).toString() : "source";
    const fn = e.rootInvocation().function().contractFn().functionName().toString();
    console.log(`  entry: ${cred} ${addr} root=${fn} subs=${e.rootInvocation().subInvocations().length}`);
  }
  const res = await kit.signAndSubmit(assembled, { forceMethod: "rpc" });
  state.passkey = authenticator.toState(); save();
  console.log(`supply result: ${json({ success: res.success, hash: res.hash, error: ("error" in res ? res.error : undefined) })}`);
  if (!res.success) throw new Error("supply failed");
  t4.supplyHash = res.hash; save();
  const r = await server.getTransaction(res.hash!);
  const ret = (r as { returnValue?: xdr.ScVal }).returnValue;
  if (ret) { t4.accountId = String(scValToNative(ret)); save(); console.log(`XOXNO account_id: ${t4.accountId}`); }
}

step("verification");
const ctrl = new Contract(XOXNO.controller);
const acc = await server.getAccount(keeper.publicKey());
const readTx = (fn: string, ...args: xdr.ScVal[]) => new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(ctrl.call(fn, ...args)).setTimeout(30).build();
if (t4.accountId) {
  const id = nativeToScVal(BigInt(t4.accountId), { type: "u64" });
  for (const fn of ["get_account_attributes", "get_account_positions", "get_health_factor", "get_total_collateral_usd"]) {
    const sim = await server.simulateTransaction(readTx(fn, id));
    console.log(`${fn}: ${rpc.Api.isSimulationSuccess(sim) ? json(scValToNative(sim.result!.retval)) : "sim failed"}`);
  }
}
console.log(`\nT4 state: ${json(t4)}`);
