/**
 * Checks of koul_agent_policy on the headless wallet, every call agent-signed and sent directly to the XOXNO
 * controller (not through the router). XOXNO must accept the call in simulation, otherwise the policy is never
 * reached, so hub 1 needs a little collateral first (`pnpm position supply 1 2`).
 *   1. controller.withdraw(wallet, 12, [(hub1, 1)], Some(borrower G))   -> 7109 WithdrawRecipientNotAllowed
 *   2. controller.repay(wallet, 23, [(hub2, 1)])                          -> 7108 AccountNotAllowed
 *   3. controller.borrow(wallet, 12, [(hub1, 1)], wallet)                -> 7103 CallNotAllowed
 *   4. controller.withdraw(wallet, 12, [(hub1, 1)], Some(wallet))        -> allowed (control), moves 1 USDC to the wallet
 *   pnpm policy-deny [recipientG]
 */
import { contract, rpc } from "@stellar/stellar-sdk";
import { ForbiddenAuthenticator, RP_ID, ORIGIN, TESTNET, XOXNO, countContexts, json, keeperKeypair, loadEnv, loadState, makeKit } from "../src/lib/common";

const env = loadEnv();
const state = loadState();
if (!state.contractId || !state.passkey || !state.t4?.accountId || state.agentRuleId === undefined) throw new Error("state missing, run setup-autopilot");
const wallet = state.contractId;
const accountId = BigInt(state.t4.accountId);
const recipient = process.argv[2] ?? "GBRXD5JOT5YV6U3VFZ4ESR6MPCLJ3MSP55SUQNKSK23465U34M6H5EZJ"; // an account with a USDC trustline
const key = (h: number) => ({ asset: XOXNO.usdc, hub_id: h });
const kit = makeKit(env, new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey));
await kit.connectWallet({ credentialId: "koul-keeper", contractId: wallet });
kit.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
const selected = kit.multiSigners.buildSelectedSigners(await kit.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
type Call = (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
const ctrl = (await contract.Client.from({ contractId: XOXNO.controller, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() })) as unknown as Record<string, Call>;
const codesIn = (s: string) => [...new Set(s.match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");

async function run(label: string, build: () => Promise<contract.AssembledTransaction<unknown>>, expect: number | "allowed"): Promise<void> {
  let outcome: string;
  let ok = false;
  try {
    const tx = await build();
    const sim = (tx as { simulation?: rpc.Api.SimulateTransactionResponse }).simulation;
    if (!sim || rpc.Api.isSimulationError(sim)) {
      outcome = `XOXNO rejected the call in simulation, policy not reached: ${sim && rpc.Api.isSimulationError(sim) ? codesIn(sim.error) || sim.error.replace(/\s+/g, " ").slice(0, 160) : "no simulation"}`;
    } else {
      const res = await kit.multiSigners.operation(tx, selected, { forceMethod: "rpc", resolveContextRuleIds: (entry) => Array<number>(countContexts(entry.rootInvocation())).fill(state.agentRuleId!) });
      const msg = res.success ? "" : (res.error as { message?: string })?.message ?? json(res.error);
      outcome = res.success ? `submitted ${res.hash}` : codesIn(msg) || msg.replace(/\s+/g, " ").slice(0, 200);
      ok = expect === "allowed" ? res.success : outcome.includes(`#${expect}`);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    outcome = codesIn(m) || m.replace(/\s+/g, " ").slice(0, 200);
    ok = expect !== "allowed" && outcome.includes(`#${expect}`);
  }
  console.log(`${ok ? "ok        " : "UNEXPECTED"} ${label} (expected ${expect === "allowed" ? "allowed" : `#${expect}`}): ${outcome}`);
  if (!ok) process.exitCode = 1;
}

await run("withdraw hub 1 -> foreign G-account", () => ctrl.withdraw!({ caller: wallet, account_id: accountId, withdrawals: [[key(1), 10_000_000n]], to: recipient }), 7109);
await run("repay debt of XOXNO account 23", () => ctrl.repay!({ caller: wallet, account_id: 23n, payments: [[key(2), 10_000_000n]] }), 7108);
await run("borrow (not allowlisted)", () => ctrl.borrow!({ caller: wallet, account_id: accountId, borrows: [[key(1), 10_000_000n]], to: wallet }), 7103);
await run("withdraw hub 1 -> own wallet", () => ctrl.withdraw!({ caller: wallet, account_id: accountId, withdrawals: [[key(1), 10_000_000n]], to: wallet }), "allowed");
