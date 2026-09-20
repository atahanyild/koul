/**
 * Off-ramp through the TR Mock Anchor from a contract wallet, Kumbara's reverse landing account:
 *   1. keeper (sponsor) creates an ownerless landing G-account with a USDC trustline;
 *      before the lock it does SEP-10 / SEP-12 / SEP-38 (sell USDC -> TRY) / SEP-6 withdraw-exchange as that account;
 *      the anchor answers with its treasury account and an id memo; a pre-authorized classic payment carrying
 *      that memo (forward) and a cleanup-merge are locked in; the landing secret is wiped.
 *   2. the smart account transfers the exact USDC to the landing account (passkey-signed here);
 *   3. forward is fee-bumped by the keeper -> the anchor matches the memo and pays TRY to the IBAN;
 *   4. cleanup returns the sponsor's reserves.
 *   pnpm tsx scripts/anchor-withdraw.ts [usdc=2]
 */
import { Asset, contract, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import { SoftwareAuthenticator } from "../src/phase0/passkey";
import { RP_ID, ORIGIN, TESTNET, XOXNO, addr, json, keeperKeypair, loadEnv, loadState, makeKit, saveState, step } from "../src/lib/common";
import { SANDBOX_TEST_IBAN, discoverAnchor } from "../src/anchor/discovery";
import { createLandingAccount, submitPreauthorized, type LandingDeps } from "../src/anchor/landing";
import { fiatAsset, sep10Authenticate, sep12Register, sep38Quote, sep6Transaction, sep6WithdrawExchange, stellarAsset } from "../src/anchor/sep";
import { localFeeBumpRelay } from "../src/anchor/local-relay";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey) throw new Error("state missing");
const wallet = state.contractId;
const amountUsdc = (process.argv[2] ?? "2").includes(".") ? process.argv[2]! : `${process.argv[2] ?? "2"}.0000000`;
const amountStroops = BigInt(Math.round(Number(amountUsdc) * 1e7));
const keeper = keeperKeypair(env);
const server = new rpc.Server(TESTNET.rpcUrl);
const deps: LandingDeps = { server, networkPassphrase: TESTNET.networkPassphrase, sponsor: keeper, relay: localFeeBumpRelay(server, keeper, TESTNET.networkPassphrase), log: (m) => console.log(`  landing: ${m}`) };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

step("anchor discovery");
const anchor = await discoverAnchor("tr-mock-anchor.fly.dev");
if (!anchor.fiatCode || !anchor.sep6?.withdrawExchange) throw new Error("anchor offers no withdraw-exchange");
const method = anchor.sep6.withdraw?.fundingMethods[0] ?? "bank_account";
const quoteMethod = anchor.sep38?.buyDeliveryMethods.includes(method) ? method : (anchor.sep38?.buyDeliveryMethods[0] ?? method);
const fiat = fiatAsset(anchor.fiatCode);
console.log(json({ fiat, method, quoteMethod, treasuryStatus: anchor.treasury }));

step(`1. reverse landing account for ${amountUsdc} USDC -> TRY to ${SANDBOX_TEST_IBAN}`);
let captured: { token: string; id: string; quoteId: string; tryOut: string; treasury: string; memo: string } | null = null;
const plan = await createLandingAccount(deps, {
  usdc: new Asset(anchor.usdc.code, anchor.usdc.issuer),
  usdcContract: anchor.usdc.contractId,
  beforeLock: async (bridge) => {
    const auth = await sep10Authenticate(anchor, bridge.publicKey, bridge.sign);
    await sep12Register(anchor, auth.token, { first_name: "Koul", last_name: wallet.slice(-6), bank_account_number: SANDBOX_TEST_IBAN });
    const quote = await sep38Quote(anchor, auth.token, { sellAsset: stellarAsset(anchor.usdc.code, anchor.usdc.issuer), buyAsset: fiat, sellAmount: amountUsdc, deliveryMethod: quoteMethod, side: "sell" });
    const wd = await sep6WithdrawExchange(anchor, auth.token, { sourceAssetCode: anchor.usdc.code, destinationAsset: fiat, amount: amountUsdc, quoteId: quote.id, account: bridge.publicKey, type: method, dest: SANDBOX_TEST_IBAN });
    if (wd.memoType !== "id") throw new Error(`anchor wants a ${wd.memoType} memo`);
    captured = { token: auth.token, id: wd.id, quoteId: quote.id, tryOut: quote.buyAmount, treasury: wd.accountId, memo: wd.memo };
    console.log(`  sep38 ${quote.id}: ${quote.sellAmount} USDC -> ${quote.buyAmount} TRY; sep6 ${wd.id}: pay ${wd.accountId.slice(0, 8)} memo ${wd.memo}`);
    return { type: "offramp", treasury: wd.accountId, memoId: wd.memo, amountStroops };
  },
});
const got = captured as unknown as { token: string; id: string; quoteId: string; tryOut: string; treasury: string; memo: string };
console.log(json({ landing: plan.publicKey, create: plan.createTxHash, lock: plan.lockTxHash, forwardHash: plan.forwardTxHash, cleanupHash: plan.cleanupTxHash, challengesSigned: plan.challengesSigned }));
state.withdraw = { plan, sep6: got.id, quote: got.quoteId, tryOut: got.tryOut }; saveState(state);

step("2. smart account -> landing account SAC transfer (passkey)");
const pk = new SoftwareAuthenticator(RP_ID, ORIGIN, state.passkey);
const kit = makeKit(env, pk);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
const tx = await contract.AssembledTransaction.build<null>({ method: "transfer", args: [addr(wallet), addr(plan.publicKey), nativeToScVal(amountStroops, { type: "i128" })], contractId: XOXNO.usdc, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeper.publicKey(), parseResultXdr: () => null });
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" });
state.passkey = pk.toState(); saveState(state);
if (!res.success) throw new Error(`transfer failed: ${json(res.error).slice(0, 400)}`);
console.log(`transfer tx ${res.hash}`);

step("3. pre-authorized payment to the treasury with the memo (keeper fee-bumps)");
const fwd = await submitPreauthorized(deps, plan.forwardTxXdr);
console.log(json(fwd));
let sep6 = await sep6Transaction(anchor, got.token, got.id);
for (let i = 0; i < 40 && sep6.status !== "completed" && !/error|expired|refunded/.test(sep6.status); i++) { await sleep(3000); sep6 = await sep6Transaction(anchor, got.token, got.id); console.log(`  sep6 ${sep6.status}`); }
console.log(json({ status: sep6.status, amountIn: sep6.amountIn, amountOut: sep6.amountOut, external: sep6.externalTransactionId, message: sep6.message }));

step("4. cleanup (trustline off, merge into the sponsor)");
const cl = await submitPreauthorized(deps, plan.cleanupTxXdr);
console.log(json(cl));
state.withdraw = { ...(state.withdraw as object), transfer: res.hash, forward: fwd.hash, cleanup: cl.hash, status: sep6.status, tryPaid: sep6.amountOut, external: sep6.externalTransactionId }; saveState(state);
console.log(sep6.status === "completed" ? "\nANCHOR WITHDRAWAL: PASS" : "\nANCHOR WITHDRAWAL: anchor did not complete");
