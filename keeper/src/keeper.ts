/**
 * Niet keeper: every INTERVAL seconds, for each registered user, simulate `router.tick(user)`.
 * `Action::None` or a failed simulation -> skip (no fee). Otherwise sign the smart-account auth entry with the
 * agent Ed25519 key (one context_rule_id per auth context) and submit. The keeper never decides anything: the
 * router evaluates the rules on-chain, and niet_agent_policy confines what the agent key can authorise.
 *   pnpm tsx src/keeper.ts [--once] [--interval 30]
 */
import { contract, rpc, xdr } from "@stellar/stellar-sdk";
import { ForbiddenAuthenticator, RP_ID, ORIGIN, TESTNET, countContexts, describeEntries, json, keeperKeypair, loadEnv, loadState, makeKit } from "./lib/common";

const env = loadEnv();
const state = loadState();
const once = process.argv.includes("--once");
const intervalArg = process.argv.indexOf("--interval");
const interval = intervalArg > 0 ? Number(process.argv[intervalArg + 1]) : 30;
const ROUTER = env.ROUTER_V1!;

interface User { wallet: string; credentialId: string; agentRuleId: number }
const users: User[] = state.contractId && state.passkey && state.agentRuleId !== undefined
  ? [{ wallet: state.contractId, credentialId: state.passkey.credentialId, agentRuleId: state.agentRuleId }]
  : [];
if (users.length === 0) throw new Error("no registered users (run scripts/setup-rules.ts)");

const log = (u: User, m: string) => console.log(`${new Date().toISOString()} ${u.wallet.slice(0, 8)} ${m}`);
const router = await contract.Client.from({ contractId: ROUTER, networkPassphrase: TESTNET.networkPassphrase, rpcUrl: TESTNET.rpcUrl, publicKey: keeperKeypair(env).publicKey() });
type RouterClient = { tick: (a: { user: string }) => Promise<contract.AssembledTransaction<unknown>> };

function describeAction(a: unknown): string {
  if (!a || typeof a !== "object") return String(a);
  const t = a as { tag?: string; values?: unknown[] };
  if (t.tag === "None") return "None";
  return `${t.tag}(${(t.values ?? []).map(String).join(", ")})`;
}

async function tickOnce(u: User): Promise<void> {
  const kit = makeKit(env, new ForbiddenAuthenticator(RP_ID, ORIGIN, state.passkey));
  await kit.connectWallet({ credentialId: u.credentialId, contractId: u.wallet });
  kit.externalSigners.addEd25519FromSecret(env.AGENT_SECRET!);
  const selected = kit.multiSigners.buildSelectedSigners(await kit.multiSigners.getAvailableSigners(), null).filter((s) => s.type === "ed25519");
  if (selected.length !== 1) { log(u, "agent key is not a signer on this wallet, skipping"); return; }

  let tx: contract.AssembledTransaction<unknown>;
  try {
    tx = await (router as unknown as RouterClient).tick({ user: u.wallet });
  } catch (err) {
    log(u, `simulation failed, skipping: ${(err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 300)}`);
    return;
  }
  const sim = (tx as { simulation?: rpc.Api.SimulateTransactionResponse }).simulation;
  if (!sim || rpc.Api.isSimulationError(sim)) {
    const codes = [...new Set((sim && rpc.Api.isSimulationError(sim) ? sim.error : "").match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");
    log(u, `simulation error, skipping: ${codes || (sim && rpc.Api.isSimulationError(sim) ? sim.error.replace(/\s+/g, " ").slice(0, 200) : "no simulation")}`);
    return;
  }
  let action: string;
  try { action = describeAction(tx.result); } catch (err) { log(u, `cannot read result, skipping: ${err instanceof Error ? err.message : String(err)}`); return; }
  if (action === "None") { log(u, "tick -> None, nothing to do"); return; }
  const op = tx.built?.operations[0];
  const entries = op && "auth" in op ? (op as { auth: xdr.SorobanAuthorizationEntry[] }).auth : [];
  if (entries.length === 0) { log(u, "no auth entries in simulation, skipping"); return; }
  log(u, `tick -> ${action}; auth: ${describeEntries(entries).join(" | ")}`);

  let lastSim = "";
  const orig = kit.rpc.simulateTransaction.bind(kit.rpc);
  (kit.rpc as { simulateTransaction: typeof orig }).simulateTransaction = async (...a: Parameters<typeof orig>) => {
    const r = await orig(...a);
    if (rpc.Api.isSimulationError(r)) lastSim = r.error;
    return r;
  };
  const res = await kit.multiSigners.operation(tx, selected, {
    forceMethod: "rpc",
    resolveContextRuleIds: (entry) => Array<number>(countContexts(entry.rootInvocation())).fill(u.agentRuleId),
  });
  if (!res.success) {
    const codes = [...new Set(lastSim.match(/Error\(Contract, #\d+\)/g) ?? [])].join(",");
    log(u, `submit FAILED ${codes || json(res.error).slice(0, 200)}`);
    return;
  }
  log(u, `submitted ${res.hash}`);
  const r = await kit.rpc.getTransaction(res.hash!);
  const ret = (r as { returnValue?: xdr.ScVal }).returnValue;
  if (ret) log(u, `on-chain result: ${json(tx.parseResultXdr?.(ret) ?? ret.switch().name)}`);
}

do {
  for (const u of users) {
    try { await tickOnce(u); } catch (err) { log(u, `error: ${err instanceof Error ? err.message : String(err)}`); }
  }
  if (!once) await new Promise((r) => setTimeout(r, interval * 1000));
} while (!once);
