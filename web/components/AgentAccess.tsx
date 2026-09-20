"use client";

import { useCallback, useEffect, useState } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import { createDefaultContext, createEd25519Signer, type ContextRule } from "smart-account-kit";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { AGENT_ALLOWED_CALLS, AGENT_TRANSFER_RECIPIENTS, LEDGERS_PER_DAY, KOUL, agentPolicyParams, explorerTx, short } from "@/lib/koul";

const RULE_PREFIX = "koul-agent";


/**
 * Grant / revoke the Koul agent on the connected smart account. This is the flow the Sembol PR packages as
 * `useAgentPermission` + `<GrantAgentAccess/>` + `<AgentPermissions/>`; here it is inlined against the kit.
 */
export function AgentAccess() {
  const { kit, isConnected, address, txEpoch, config } = usePasskeyWallet();
  const [rules, setRules] = useState<ContextRule[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [ledger, setLedger] = useState<number | null>(null);
  const [days, setDays] = useState(1);

  const refresh = useCallback(async () => {
    if (!kit || !isConnected) { setRules([]); return; }
    try {
      const [list, latest] = await Promise.all([kit.rules.list(), kit.rpc.getLatestLedger()]);
      setRules(list);
      setLedger(latest.sequence);
    } catch (err) { setMsg({ err: String(err) }); }
  }, [kit, isConnected]);
  useEffect(() => { void refresh(); }, [refresh, txEpoch]);

  const agentRules = rules.filter((r) => r.signers.some((s) => s.tag === "External" && config.ed25519VerifierAddress === s.values[0]));

  async function grant() {
    if (!kit || !isConnected) return;
    setBusy("grant"); setMsg({});
    try {
      const latest = (await kit.rpc.getLatestLedger()).sequence;
      const pub = Keypair.fromPublicKey(KOUL.agentPublicKey).rawPublicKey();
      const signer = createEd25519Signer(config.ed25519VerifierAddress!, pub);
      const name = `${RULE_PREFIX}-${KOUL.router.slice(1, 7).toLowerCase()}`;
      const tx = await kit.rules.add(createDefaultContext(), name, [signer], new Map([[KOUL.policy, agentPolicyParams()]]), latest + days * LEDGERS_PER_DAY);
      const res = await kit.signAndSubmit(tx);
      if (!res.success) throw new Error(JSON.stringify(res.error).slice(0, 300));
      setMsg({ ok: `Agent granted for ${days} day(s). Tx ${res.hash}` });
    } catch (err) { setMsg({ err: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(null); await refresh(); }
  }

  async function revoke(id: number) {
    if (!kit) return;
    setBusy(`revoke-${id}`); setMsg({});
    try {
      const res = await kit.signAndSubmit(await kit.rules.remove(id));
      if (!res.success) throw new Error(JSON.stringify(res.error).slice(0, 300));
      setMsg({ ok: `Rule ${id} removed. The agent lost access in tx ${res.hash}` });
    } catch (err) { setMsg({ err: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(null); await refresh(); }
  }

  if (!isConnected || !address) return null;
  return (
    <section className="card">
      <h2>Agent access</h2>
      <p className="sub">One passkey confirmation adds the keeper&apos;s key as a signer, bound to the Koul policy. The key can only call what is listed below, and only send USDC to the XOXNO pool.</p>
      <table>
        <tbody>
          <tr><th>May call</th><td className="mono">{AGENT_ALLOWED_CALLS.map(([c, f]) => `${short(c)}.${f}`).join("  ·  ")}</td></tr>
          <tr><th>May transfer to</th><td className="mono">{AGENT_TRANSFER_RECIPIENTS.map(short).join(", ")} (XOXNO pool only)</td></tr>
          <tr><th>Rate limit</th><td>40 policy checks per ~2000 ledgers (about 10 ticks)</td></tr>
          <tr><th>Agent key</th><td className="mono">{KOUL.agentPublicKey}</td></tr>
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <label>Valid for<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
        <button className="btn" disabled={busy !== null} onClick={() => void grant()}>{busy === "grant" ? "Confirm with passkey…" : "Grant agent access"}</button>
      </div>
      <h2 style={{ marginTop: 18 }}>Active permissions</h2>
      {agentRules.length === 0 ? <p className="muted">No agent has access to this wallet.</p> : (
        <table><thead><tr><th>Rule</th><th>Name</th><th>Policies</th><th>Expires</th><th /></tr></thead><tbody>
          {agentRules.map((r) => {
            const left = r.valid_until && ledger ? Math.max(0, Number(r.valid_until) - ledger) : null;
            return (
              <tr key={r.id}>
                <td>{r.id}</td><td>{r.name}</td>
                <td className="mono">{r.policies.length ? r.policies.map(short).join(", ") : <span className="err">NONE (unrestricted!)</span>}</td>
                <td>{left === null ? "never" : `${(left * 5 / 3600).toFixed(1)} h`}</td>
                <td><button className="btn danger" disabled={busy !== null} onClick={() => void revoke(r.id)}>{busy === `revoke-${r.id}` ? "Confirm…" : "Revoke"}</button></td>
              </tr>
            );
          })}
        </tbody></table>
      )}
      {msg.ok && <p className="ok">{msg.ok.replace(/Tx ([0-9a-f]{64})/, "")} {msg.ok.match(/[0-9a-f]{64}/) && <a className="mono" href={explorerTx(msg.ok.match(/[0-9a-f]{64}/)![0])} target="_blank">view tx</a>}</p>}
      {msg.err && <p className="err">{msg.err}</p>}
    </section>
  );
}
