"use client";

import { useCallback, useEffect, useState } from "react";
import { contract } from "@stellar/stellar-sdk";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { NIET, XOXNO, explorerTx, tryPerUsdToUsdPerTry, usdPerTryToTryPerUsd } from "@/lib/niet";

interface Rules { account_id: bigint; hub_a: number; hub_b: number; rebalance_threshold_bps: number; min_health_factor_wad: bigint; fx_enabled: boolean; fx_asset: string; fx_level: bigint; fx_above: boolean; max_price_age_secs: bigint }
type RouterClient = { get_rules: (a: { user: string }) => Promise<contract.AssembledTransaction<Rules | undefined>>; set_rules: (a: { user: string; rules: Rules }) => Promise<contract.AssembledTransaction<null>> };

/** The user's rule set on the Niet router: written once with the passkey, evaluated by the router on every tick. */
export function Strategy() {
  const { kit, isConnected, address, txEpoch } = usePasskeyWallet();
  const [router, setRouter] = useState<RouterClient | null>(null);
  const [current, setCurrent] = useState<Rules | null | undefined>(undefined);
  const [accountId, setAccountId] = useState("");
  const [threshold, setThreshold] = useState("100");
  const [minHf, setMinHf] = useState("1.25");
  const [fxOn, setFxOn] = useState(true);
  const [fxLevel, setFxLevel] = useState("50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  useEffect(() => {
    if (!kit) return;
    void contract.Client.from({ contractId: NIET.router, networkPassphrase: NIET.networkPassphrase, rpcUrl: NIET.rpcUrl, publicKey: kit.deployerPublicKey }).then((c) => setRouter(c as unknown as RouterClient));
  }, [kit]);

  const refresh = useCallback(async () => {
    if (!router || !address) return;
    try {
      const r = (await router.get_rules({ user: address })).result ?? null;
      setCurrent(r);
      if (r) { setAccountId(String(r.account_id)); setThreshold(String(r.rebalance_threshold_bps)); setMinHf((Number(r.min_health_factor_wad) / 1e18).toString()); setFxOn(r.fx_enabled); setFxLevel(usdPerTryToTryPerUsd(r.fx_level).toFixed(2)); }
    } catch (err) { setMsg({ err: String(err) }); }
  }, [router, address]);
  useEffect(() => { void refresh(); }, [refresh, txEpoch]);

  async function save() {
    if (!kit || !router || !address) return;
    setBusy(true); setMsg({});
    try {
      const rules: Rules = {
        account_id: BigInt(accountId || "0"), hub_a: 1, hub_b: 2,
        rebalance_threshold_bps: Number(threshold),
        min_health_factor_wad: BigInt(Math.round(Number(minHf) * 1e6)) * 10n ** 12n,
        fx_enabled: fxOn, fx_asset: "TRY", fx_level: tryPerUsdToUsdPerTry(Number(fxLevel)), fx_above: false, max_price_age_secs: 900n,
      };
      const tx = await router.set_rules({ user: address, rules });
      const res = await kit.signAndSubmit(tx);
      if (!res.success) throw new Error(JSON.stringify(res.error).slice(0, 300));
      setMsg({ ok: res.hash! });
    } catch (err) { setMsg({ err: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); await refresh(); }
  }

  if (!isConnected) return null;
  return (
    <section className="card">
      <h2>Strategy: Kur korumalı getiri</h2>
      <p className="sub">Evaluated on-chain by the router in this order: health guard, then yield rebalance between the two XOXNO USDC hubs, then FX exit. Stored with one passkey confirmation.</p>
      <div className="row">
        <label>XOXNO account id<input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="from your first supply" style={{ width: 120 }} /></label>
        <label>Rebalance gap (bps)<input value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: 90 }} /></label>
        <label>Min health factor<input value={minHf} onChange={(e) => setMinHf(e.target.value)} style={{ width: 90 }} /></label>
        <label>FX exit when USD/TRY ≥<input value={fxLevel} onChange={(e) => setFxLevel(e.target.value)} style={{ width: 90 }} disabled={!fxOn} /></label>
        <label>FX exit<select value={fxOn ? "on" : "off"} onChange={(e) => setFxOn(e.target.value === "on")}><option value="on">armed</option><option value="off">off</option></select></label>
        <button className="btn" disabled={busy || !router} onClick={() => void save()}>{busy ? "Confirm with passkey…" : current ? "Update rules" : "Save rules"}</button>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        {current === undefined ? "Reading rules…" : current === null ? "No rules stored for this wallet yet." : `On-chain: account ${current.account_id}, gap ${current.rebalance_threshold_bps} bps, min HF ${(Number(current.min_health_factor_wad) / 1e18).toFixed(2)}, FX ${current.fx_enabled ? `armed at ${usdPerTryToTryPerUsd(current.fx_level).toFixed(2)} TRY/USD` : "off"}.`}
        {" "}Hubs: 1 = USDC, 2 = USDC_HUB2 on spoke {XOXNO.spoke}.
      </p>
      {msg.ok && <p className="ok">Saved. <a className="mono" href={explorerTx(msg.ok)} target="_blank">view tx</a></p>}
      {msg.err && <p className="err">{msg.err}</p>}
    </section>
  );
}
