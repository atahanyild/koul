"use client";

import { useCallback, useEffect, useState } from "react";
import { NIET, explorerTx, tryPerUsdToUsdPerTry, usdPerTryToTryPerUsd } from "@/lib/niet";

interface Reading { oracle: string; admin: string | null; price: string | null; timestamp: number | null; now: number }

/** Demo control panel for the mock FX oracle. Move USD/TRY and the next keeper tick reacts. */
export default function OracleAdmin() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  const refresh = useCallback(async () => {
    const r = (await (await fetch("/api/oracle", { cache: "no-store" })).json()) as Reading;
    setReading(r);
    if (r.price && !input) setInput(usdPerTryToTryPerUsd(BigInt(r.price)).toFixed(2));
  }, [input]);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); return () => clearInterval(t); }, [refresh]);

  async function set(tryPerUsd: number, stale = false) {
    setBusy(true); setMsg({});
    try {
      const body: Record<string, unknown> = { price: tryPerUsdToUsdPerTry(tryPerUsd).toString() };
      if (stale) body.timestamp = Math.floor(Date.now() / 1000) - 3600;
      const r = (await (await fetch("/api/oracle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) as { hash?: string; status?: string; error?: string };
      if (r.error) throw new Error(r.error);
      setMsg({ ok: `${r.status} ${r.hash}` });
      setInput(tryPerUsd.toFixed(2));
    } catch (err) { setMsg({ err: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); await refresh(); }
  }

  const current = reading?.price ? usdPerTryToTryPerUsd(BigInt(reading.price)) : null;
  const age = reading?.timestamp ? reading.now - reading.timestamp : null;
  return (
    <section className="card">
      <h2>Mock FX oracle</h2>
      <p className="sub">Testnet stand-in for Reflector (same read interface). The router reads it on every tick and rejects prices older than the user&apos;s limit.</p>
      <table><tbody>
        <tr><th>Contract</th><td className="mono">{NIET.oracle}</td></tr>
        <tr><th>USD/TRY now</th><td style={{ fontSize: 22, fontWeight: 700 }}>{current ? current.toFixed(4) : "…"} <span className="muted" style={{ fontSize: 13 }}>({reading?.price} USD per TRY, 14 decimals)</span></td></tr>
        <tr><th>Price age</th><td className={age !== null && age > 900 ? "err" : "ok"}>{age === null ? "…" : `${age} s${age > 900 ? " (stale for a 900 s rule)" : ""}`}</td></tr>
        <tr><th>Admin</th><td className="mono">{reading?.admin ?? <span className="err">ORACLE_ADMIN_SECRET not set</span>}</td></tr>
      </tbody></table>
      <div className="row" style={{ marginTop: 14 }}>
        <label>USD/TRY<input value={input} onChange={(e) => setInput(e.target.value)} style={{ width: 110 }} inputMode="decimal" /></label>
        <button className="btn" disabled={busy} onClick={() => void set(Number(input))}>Set price</button>
        <button className="btn secondary" disabled={busy} onClick={() => void set(48.79)}>48.79 (calm)</button>
        <button className="btn secondary" disabled={busy} onClick={() => void set(50.25)}>50.25 (lira shock, triggers exit at 50)</button>
        <button className="btn secondary" disabled={busy} onClick={() => void set(Number(input) || 48.79, true)}>Publish stale (1 h old)</button>
      </div>
      {msg.ok && <p className="ok">{msg.ok.split(" ")[0]} <a className="mono" href={explorerTx(msg.ok.split(" ")[1])} target="_blank">view tx</a></p>}
      {msg.err && <p className="err">{msg.err}</p>}
    </section>
  );
}
