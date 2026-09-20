/**
 * Print the failing diagnostic events of a testnet transaction (contract errors, host errors, logs).
 *   pnpm tx-diag <hash> [<hash> ...]
 */
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { TESTNET } from "../src/lib/common";

const server = new rpc.Server(TESTNET.rpcUrl);
const show = (v: xdr.ScVal): string => { try { return JSON.stringify(scValToNative(v), (_k, x) => (typeof x === "bigint" ? x.toString() : x)); } catch { return v.switch().name; } };
for (const hash of process.argv.slice(2)) {
  const t = await server.getTransaction(hash);
  console.log(`${hash.slice(0, 8)} ${t.status}${"ledger" in t ? ` ledger ${t.ledger}` : ""}`);
  const events = (t as { diagnosticEventsXdr?: xdr.DiagnosticEvent[] }).diagnosticEventsXdr ?? [];
  for (const d of events) {
    const body = d.event().body().v0();
    const line = `${body.topics().map(show).join(" ")} ${show(body.data())}`;
    if (!d.inSuccessfulContractCall() && /error|fail|log/i.test(line) && !/core_metrics/.test(line)) console.log(`  ${line.slice(0, 260)}`);
  }
}
