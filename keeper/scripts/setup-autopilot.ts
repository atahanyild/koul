/**
 * Passkey-signed setup for one user (the headless wallet):
 *   1. add the RULE_NAME Default rule: agent Ed25519 signer + koul_agent_policy pinned to the user's XOXNO account,
 *      allowlisting the router's tick and the controller calls the router makes;
 *   2. remove older koul-agent / niet-agent rules (previous policies or routers);
 *   3. router.set_autopilot(wallet, 1, Lira shield): health guard, rebalance both ways, FX exit from both hubs.
 *   pnpm setup-autopilot
 */
import { contract } from "@stellar/stellar-sdk";
import { createDefaultContext, createEd25519Signer } from "smart-account-kit";
import { SoftwareAuthenticator } from "../src/phase0/passkey";
import { LEDGERS_PER_DAY, TESTNET, XOXNO, agentKeypair, json, keeperKeypair, loadEnv, loadState, makeKit, policyParams, saveState, step } from "../src/lib/common";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey || !state.t4?.accountId) throw new Error("phase-0 state missing");
const wallet = state.contractId;
const accountId = BigInt(state.t4.accountId);
const ROUTER = env.ROUTER_V1!;
const KOUL_POLICY = env.KOUL_POLICY!;
const RULE_NAME = `koul-agent-${ROUTER.slice(1, 7).toLowerCase()}`; // one rule per router address
const AUTOPILOT_ID = 1;
const pk = new SoftwareAuthenticator("koul.local", "https://koul.local", state.passkey);
const kit = makeKit(env, pk);
await kit.connectWallet({ credentialId: state.passkey.credentialId, contractId: wallet });
const save = () => { state.passkey = pk.toState(); saveState(state); };

step(`1. ${RULE_NAME} rule under policy ${KOUL_POLICY.slice(0, 8)} for XOXNO account ${accountId}`);
const params = policyParams({
  accountId,
  allowedCalls: [[ROUTER, "tick"], [XOXNO.controller, "withdraw"], [XOXNO.controller, "supply"], [XOXNO.controller, "repay"], [XOXNO.usdc, "transfer"]],
  recipients: [XOXNO.pool],
  maxCalls: 40, windowLedgers: 2000,
});
let rules = await kit.rules.list();
let mine = rules.find((r) => r.name === RULE_NAME && r.policies.includes(KOUL_POLICY));
if (!mine) {
  const ledger = (await kit.rpc.getLatestLedger()).sequence;
  const signer = createEd25519Signer(TESTNET.ed25519VerifierAddress, agentKeypair(env).rawPublicKey());
  const tx = await kit.rules.add(createDefaultContext(), RULE_NAME, [signer], new Map([[KOUL_POLICY, params]]), ledger + LEDGERS_PER_DAY);
  const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" }); save();
  if (!res.success) throw new Error(`rules.add failed: ${json(res.error).slice(0, 500)}`);
  console.log(`added, tx ${res.hash}`);
  for (let i = 0; i < 10 && !mine; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    rules = await kit.rules.list();
    mine = rules.find((r) => r.name === RULE_NAME && r.policies.includes(KOUL_POLICY));
  }
  if (!mine) throw new Error("rule not visible after add");
}
state.agentRuleId = Number(mine.id); saveState(state);
console.log(`agent rule id: ${state.agentRuleId}`);

step("2. remove stale agent rules");
for (const old of rules.filter((r) => (r.name.startsWith("koul-agent") || r.name.startsWith("niet-agent")) && r.id !== mine!.id)) {
  const res = await kit.signAndSubmit(await kit.rules.remove(Number(old.id)), { forceMethod: "rpc" }); save();
  console.log(`removed rule ${old.id} ${old.name}: ${res.success ? res.hash : json(res.error).slice(0, 300)}`);
}
console.log((await kit.rules.list()).map((r) => `${r.id}:${r.name}`).join(", "));

step(`3. router.set_autopilot(${wallet.slice(0, 8)}, ${AUTOPILOT_ID}, Lira shield)`);
const WAD = 10n ** 18n;
const TRY_LEVEL = 2_000_000_000_000n; // USD per TRY <= 0.0200, i.e. USD/TRY >= 50.00, 14 decimals
const unit = (tag: string) => ({ tag, values: undefined });
const rule = (conditions: unknown[], action: unknown, cooldown_ledgers: number, match_all = true) => ({ conditions, match_all, action, cooldown_ledgers });
const autopilot = {
  account_id: accountId,
  rules: [
    rule([{ tag: "HealthFactor", values: [unit("Below"), 125n * WAD / 100n] }], { tag: "RepayFromWallet", values: [1, unit("All")] }, 30),
    rule([{ tag: "SupplyRateGap", values: [2, 1, 100] }], { tag: "MoveSupply", values: [1, 2, unit("All")] }, 300),
    rule([{ tag: "SupplyRateGap", values: [1, 2, 100] }], { tag: "MoveSupply", values: [2, 1, unit("All")] }, 300),
    rule([{ tag: "FxPrice", values: ["TRY", unit("Below"), TRY_LEVEL, 900n] }], { tag: "WithdrawToWallet", values: [1, unit("All")] }, 30),
    rule([{ tag: "FxPrice", values: ["TRY", unit("Below"), TRY_LEVEL, 900n] }], { tag: "WithdrawToWallet", values: [2, unit("All")] }, 30),
  ],
};
const router = await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() });
type RouterClient = {
  set_autopilot: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<null>>;
  get_autopilot: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
  list_ids: (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
};
const r = router as unknown as RouterClient;
const tx = await r.set_autopilot({ user: wallet, id: AUTOPILOT_ID, autopilot });
const res = await kit.signAndSubmit(tx, { forceMethod: "rpc" }); save();
console.log(`set_autopilot: ${res.success ? res.hash : json(res.error).slice(0, 500)}`);
console.log(`ids: ${json((await r.list_ids({ user: wallet })).result)}`);
console.log(`stored: ${json((await r.get_autopilot({ user: wallet, id: AUTOPILOT_ID })).result)}`);
