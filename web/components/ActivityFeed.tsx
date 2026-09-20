"use client";

import { useEffect, useState } from "react";
import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { KOUL, explorerTx } from "@/lib/koul";

interface Fired { ledger: number; tx: string; branch: string; amount: bigint; from_hub: number; to_hub: number; observed: bigint; observed_2: bigint }

const describe = (f: Fired): string => {
  const usdc = (Number(f.amount) / 1e7).toFixed(2);
  if (f.branch === "rebalance") return `Hub ${f.to_hub} paid ${(Number(f.observed_2) / 1e25).toFixed(2)}% vs hub ${f.from_hub} ${(Number(f.observed) / 1e25).toFixed(2)}%: moved ${usdc} USDC`;
  if (f.branch === "health") return `Health factor ${(Number(f.observed) / 1e18).toFixed(2)} under the minimum: repaid ${usdc} USDC from the wallet, now ${f.observed_2 > 10n ** 30n ? "∞" : (Number(f.observed_2) / 1e18).toFixed(2)}`;
  if (f.branch === "fx_exit") return `USD/TRY crossed ${(1e14 / Number(f.observed_2)).toFixed(2)} (now ${(1e14 / Number(f.observed)).toFixed(2)}): withdrew ${usdc} USDC to the wallet`;
  return `${f.branch}: ${usdc} USDC`;
};

/** Every executed branch, straight from the router's `Fired` events for this wallet. */
export function ActivityFeed() {
  const { isConnected, address, txEpoch } = usePasskeyWallet();
  const [items, setItems] = useState<Fired[]>([]);
  useEffect(() => {
    if (!isConnected || !address) return;
    const server = new rpc.Server(KOUL.rpcUrl);
    (async () => {
      const latest = (await server.getLatestLedger()).sequence;
      const res = await server.getEvents({
        startLedger: Math.max(1, latest - 17280 * 6),
        filters: [{ type: "contract", contractIds: [KOUL.router], topics: [[xdr.ScVal.scvSymbol("fired").toXDR("base64"), new Address(address).toScVal().toXDR("base64")]] }],
        limit: 50,
      });
      setItems(res.events.map((e) => {
        const v = scValToNative(e.value) as Record<string, unknown>;
        return { ledger: e.ledger, tx: e.txHash, branch: String(v.branch), amount: BigInt(v.amount as bigint), from_hub: Number(v.from_hub), to_hub: Number(v.to_hub), observed: BigInt(v.observed as bigint), observed_2: BigInt(v.observed_2 as bigint) };
      }).reverse());
    })().catch(() => setItems([]));
  }, [isConnected, address, txEpoch]);
  if (!isConnected) return null;
  return (
    <section className="card">
      <h2>Activity</h2>
      <p className="sub">Each entry is a branch the router executed for this wallet, with the reason it saw on-chain.</p>
      {items.length === 0 ? <p className="muted">Nothing executed yet.</p> : (
        <ul className="feed">{items.map((f) => <li key={f.tx}><strong>{f.branch}</strong> · ledger {f.ledger} · {describe(f)} · <a className="mono" href={explorerTx(f.tx)} target="_blank">tx</a></li>)}</ul>
      )}
    </section>
  );
}
