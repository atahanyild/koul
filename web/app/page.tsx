"use client";

import { ConnectWalletButton, CreateWalletButton, WalletBalance, usePasskeyWallet } from "@sembol/passkey-react";
import { AgentAccess } from "@/components/AgentAccess";
import { Strategy } from "@/components/Strategy";
import { ActivityFeed } from "@/components/ActivityFeed";
import { XOXNO } from "@/lib/niet";

export default function Home() {
  const { isConnected, address, status, error, fund, disconnect } = usePasskeyWallet();
  return (
    <>
      <section className="card">
        <h2>Wallet</h2>
        <p className="sub">A passkey smart account (OpenZeppelin, via Sembol). No seed phrase; the relayer pays fees on testnet.</p>
        {!isConnected ? (
          <div className="row"><CreateWalletButton /><ConnectWalletButton /><span className="muted">{status}</span></div>
        ) : (
          <div className="row">
            <span className="mono">{address}</span>
            <WalletBalance />
            <WalletBalance token={{ contractId: XOXNO.usdc }} />
            <button className="btn secondary" onClick={() => void fund()}>Fund XLM (friendbot)</button>
            <button className="btn secondary" onClick={() => void disconnect()}>Disconnect</button>
          </div>
        )}
        {error && <p className="err">{error.message}</p>}
      </section>
      <AgentAccess />
      <Strategy />
      <ActivityFeed />
    </>
  );
}
