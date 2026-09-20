/**
 * Passkey-signed setup for one user (the headless wallet):
 *   1. add the RULE_NAME Default rule: agent Ed25519 signer + koul_agent_policy allowlisting the real router;
 *   2. remove the phase-0 "koul-agent-v1" rule (old router probe);
 *   3. router.set_rules(wallet, ...) with the strategy parameters.
 *   pnpm tsx scripts/setup-rules.ts
 */
import { contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { createDefaultContext, createEd25519Signer } from "smart-account-kit";
import { SoftwareAuthenticator } from "../src/phase0/passkey";
import { LEDGERS_PER_DAY, TESTNET, XOXNO, agentKeypair, json, keeperKeypair, loadEnv, loadState, makeKit, policyParams, saveState, step, sym } from "../src/lib/common";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey || !state.t4?.accountId) throw new Error("phase-0 state missing");
const wallet = state.contractId;
const ROUTER = env.ROUTER_V1!;
const KOUL_POLICY = env.KOUL_POLICY!;
const RULE_NAME = `koul-agent-${ROUTER.slice(1, 7).toLowerCase()}`; // one rule per router address
const pk = new SoftwareAuthenticator("koul.local", "https://koul.local", state.passkey);
const kit = makeKit(env, pk);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
const save = () => { state.passkey = pk.toState(); saveState(state); };

step(`1. ${RULE_NAME} rule`);
const params = policyParams({
  allowedCalls: [[ROUTER, "tick"], [XOXNO.controller, "withdraw"], [XOXNO.controller, "supply"], [XOXNO.controller, "repay"], [XOXNO.usdc, "transfer"]],
  recipients: [XOXNO.pool],
  maxCalls: 40, windowLedgers: 2000,
});
let rules = await kit.rules.list();
let v2 = rules.find((r) => r.name === RULE_NAME);
if (!v2) {
  const ledger = (await kit.rpc.getLatestLedger()).sequence;
  const signer = createEd25519Signer(TESTNET.ed25519VerifierAddress, agentKeypair(env).rawPublicKey());
  const tx = await kit.rules.add(createDefaultContext(), RULE_NAME, [signer], new Map([[KOUL_POLICY, params]]), ledger + LEDGERS_PER_DAY);
  const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" }); save();
  if (!res.success) throw new Error(`rules.add failed: ${json(res.error).slice(0, 500)}`);
  console.log(`added, tx ${res.hash}`);
  for (let i = 0; i < 10 && !v2; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    rules = await kit.rules.list();
    v2 = rules.find((r) => r.name === RULE_NAME);
  }
  if (!v2) throw new Error("rule not visible after add");
}
state.agentRuleId = Number(v2.id); saveState(state);
console.log(`agent rule id: ${state.agentRuleId}`);

step("2. remove stale koul-agent-* rules");
for (const old of rules.filter((r) => (r.name.startsWith("koul-agent") || r.name.startsWith("niet-agent")) && r.name !== RULE_NAME)) {
  const res = await kit.signAndSubmit(await kit.rules.remove(Number(old.id)), { forceMethod: "rpc" }); save();
  console.log(`removed rule ${old.id} ${old.name}: ${res.success ? res.hash : json(res.error).slice(0, 300)}`);
}
console.log((await kit.rules.list()).map((r) => `${r.id}:${r.name}`).join(", "));

step("3. router.set_rules");
const router = await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() });
const rulesArg = {
  account_id: BigInt(state.t4.accountId),
  hub_a: 1, hub_b: 2,
  rebalance_threshold_bps: 100,
  min_health_factor_wad: 1_250_000_000_000_000_000n,
  fx_enabled: true,
  fx_asset: "TRY",
  fx_level: 2_000_000_000_000n,   // USD per TRY <= 0.0200, i.e. USD/TRY >= 50.00
  fx_above: false,
  max_price_age_secs: 900n,
};
const tx = await (router as unknown as { set_rules: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<null>> }).set_rules({ user: wallet, rules: rulesArg });
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" }); save();
console.log(`set_rules: ${res.success ? res.hash : json(res.error).slice(0, 500)}`);
const stored = await (router as unknown as { get_rules: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>> }).get_rules({ user: wallet });
console.log(`stored rules: ${json(stored.result)}`);
