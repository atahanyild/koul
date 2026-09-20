/**
 * Passkey-signed position changes on the headless wallet, for demo preparation:
 *   pnpm position show
 *   pnpm position supply <hub> <usdc>      wallet -> hub collateral
 *   pnpm position borrow <hub> <usdc>      hub -> wallet, creates debt (pushes the health factor down)
 *   pnpm position repay <hub> <usdc>       wallet -> hub debt
 *   pnpm position withdraw <hub> <usdc>    hub collateral -> wallet
 * Every call is signed by the software passkey; the agent key is never used here.
 */
import { Address, BASE_FEE, Contract, TransactionBuilder, contract, rpc, scValToNative } from "@stellar/stellar-sdk";
import { SoftwareAuthenticator } from "../src/phase0/passkey";
import { RP_ID, ORIGIN, TESTNET, XOXNO, json, keeperKeypair, loadEnv, loadState, makeKit, saveState } from "../src/lib/common";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey || !state.t4?.accountId) throw new Error("state missing");
const wallet = state.contractId;
const accountId = BigInt(state.t4.accountId);
const [cmd, hubArg, usdcArg] = process.argv.slice(2);
const hub = Number(hubArg ?? "1");
const amount = BigInt(Math.round(Number(usdcArg ?? "0") * 1e7));
const key = (h: number) => ({ asset: XOXNO.usdc, hub_id: h });

type Call = (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
type Ctrl = { supply: Call; borrow: Call; repay: Call; withdraw: Call; get_health_factor: Call; get_collateral_amount: Call; get_borrow_amount: Call };
type PoolC = { get_deposit_rate: Call; get_sync_data: Call; get_supplied_amount: Call; get_borrowed_amount: Call };
const opts = { networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() };
const c = (await contract.Client.from({ contractId: XOXNO.controller, ...opts })) as unknown as Ctrl;
const p = (await contract.Client.from({ contractId: XOXNO.pool, ...opts })) as unknown as PoolC;
const server = new rpc.Server(TESTNET.rpcUrl);
/** The USDC contract is a Stellar asset contract (no wasm), so the spec-based client cannot load it. */
async function balance(id: string): Promise<bigint> {
  const acc = await server.getAccount(opts.publicKey);
  const built = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: TESTNET.networkPassphrase }).addOperation(new Contract(XOXNO.usdc).call("balance", new Address(id).toScVal())).setTimeout(30).build();
  const sim = await server.simulateTransaction(built);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("balance simulation failed");
  return scValToNative(sim.result!.retval) as bigint;
}
const usdc = (v: unknown) => (Number(v as bigint) / 1e7).toFixed(2);

async function show(): Promise<void> {
  const hf = (await c.get_health_factor({ account_id: accountId })).result as bigint;
  console.log(`wallet ${wallet.slice(0, 8)} account ${accountId} health factor ${hf > 10n ** 30n ? "inf" : (Number(hf) / 1e18).toFixed(4)} idle USDC ${usdc(await balance(wallet))}`);
  for (const h of [1, 2]) {
    const coll = (await c.get_collateral_amount({ account_id: accountId, hub_asset: key(h) })).result;
    const debt = (await c.get_borrow_amount({ account_id: accountId, hub_asset: key(h) })).result;
    const rate = (await p.get_deposit_rate({ hub_asset: key(h) })).result as bigint;
    const sd = (await p.get_sync_data({ hub_asset: key(h) })).result as { state: { cash: bigint } };
    const supplied = (await p.get_supplied_amount({ hub_asset: key(h) })).result;
    const borrowed = (await p.get_borrowed_amount({ hub_asset: key(h) })).result;
    console.log(`hub ${h}: collateral ${usdc(coll)} debt ${usdc(debt)} rate ${(Number(rate) / 1e25).toFixed(2)}% cash ${usdc(sd.state.cash)} supplied ${usdc(supplied)} borrowed ${usdc(borrowed)}`);
  }
}

if (cmd === "show" || !cmd) {
  await show();
  process.exit(0);
}
if (amount <= 0n) throw new Error("usage: position <supply|borrow|repay|withdraw> <hub> <usdc>");
const pk = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const kit = makeKit(env, pk);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
let tx: contract.AssembledTransaction<unknown>;
if (cmd === "supply") tx = await c.supply({ caller: wallet, account_id: accountId, spoke_id: XOXNO.spoke, assets: [[key(hub), amount]] });
else if (cmd === "borrow") tx = await c.borrow({ caller: wallet, account_id: accountId, borrows: [[key(hub), amount]], to: wallet });
else if (cmd === "repay") tx = await c.repay({ caller: wallet, account_id: accountId, payments: [[key(hub), amount]] });
else if (cmd === "withdraw") tx = await c.withdraw({ caller: wallet, account_id: accountId, withdrawals: [[key(hub), amount]], to: wallet });
else throw new Error(`unknown command ${cmd}`);
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
state.passkey = pk.toState(); saveState(state);
console.log(res.success ? `${cmd} ${usdc(amount)} USDC hub ${hub}: tx ${res.hash}` : `${cmd} failed: ${json(res.error).slice(0, 400)}`);
if (!res.success) process.exit(1);
await show();
