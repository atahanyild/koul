/**
 * Health-guard demo: borrow USDC against the position with the passkey so the health factor drops under the
 * user's minimum, then let the keeper tick. Expected: router repays from idle wallet USDC (branch "health").
 *   pnpm tsx scripts/demo-health.ts [borrowUsdc=16]
 */
import { contract } from "@stellar/stellar-sdk";
import { SoftwareAuthenticator } from "../src/phase0/passkey";
import { RP_ID, ORIGIN, TESTNET, XOXNO, json, keeperKeypair, loadEnv, loadState, makeKit, saveState, step } from "../src/lib/common";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey || !state.t4?.accountId) throw new Error("state missing");
const wallet = state.contractId;
const accountId = BigInt(state.t4.accountId);
const borrow = BigInt(Math.round(Number(process.argv[2] ?? "16") * 1e7));
const pk = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const kit = makeKit(env, pk);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
const controller = await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() });
type Ctrl = { borrow: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>; get_health_factor: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>>; get_borrow_amount: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<bigint>> };
const c = controller as unknown as Ctrl;
const hf = async () => { const r = (await c.get_health_factor({ account_id: accountId })).result; return r > 10n ** 30n ? "inf" : (Number(r) / 1e18).toFixed(4); };

step(`health factor before: ${await hf()}`);
step(`passkey-signed borrow of ${Number(borrow) / 1e7} USDC from hub 1 to the wallet`);
const tx = await c.borrow({ caller: wallet, account_id: accountId, borrows: [[{ asset: XOXNO.usdc, hub_id: 1 }, borrow]], to: wallet });
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
state.passkey = pk.toState(); saveState(state);
console.log(res.success ? `borrow tx ${res.hash}` : `borrow failed: ${json(res.error).slice(0, 400)}`);
if (!res.success) process.exit(1);
console.log(`health factor after borrow: ${await hf()}  (rule minimum 1.25)`);
console.log(`debt hub1: ${(await c.get_borrow_amount({ account_id: accountId, hub_asset: { asset: XOXNO.usdc, hub_id: 1 } })).result}`);
