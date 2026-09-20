"use client";

import { useCallback, useState } from "react";
import { usePasskeyWallet, useWalletBalance, useCreateWallet, useConnectWallet, toSembolError, type SembolError } from "@sembol/passkey-react";
import { XOXNO } from "@/lib/koul";
import { shortAddress } from "@/lib/format";

/** The connected passkey wallet, balances included. Thin wrapper over Sembol so pages import one thing. */
export function useWallet() {
  const w = usePasskeyWallet();
  const usdc = useWalletBalance({ token: { contractId: XOXNO.usdc }, enabled: w.isConnected, refreshInterval: 30_000 });
  const xlm = useWalletBalance({ token: "native", enabled: w.isConnected, refreshInterval: 60_000 });
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    if (!w.address) return false;
    try { await navigator.clipboard.writeText(w.address); setCopied(true); setTimeout(() => setCopied(false), 1800); return true; } catch { return false; }
  }, [w.address]);
  return {
    ...w,
    short: w.address ? shortAddress(w.address) : null,
    usdc: usdc.formatted !== null ? Number(usdc.formatted) : null,
    usdcStatus: usdc.status,
    xlm: xlm.formatted !== null ? Number(xlm.formatted) : null,
    refetchBalances: async () => { await Promise.all([usdc.refetch(), xlm.refetch()]); },
    copy,
    copied,
    initializing: w.status === "initializing",
  };
}

export type PasskeyPhase = "idle" | "prompt" | "deploying" | "funding" | "submitting" | "success" | "cancelled" | "error";

/**
 * Create or connect with a clear pending state and a clear recovery when the user cancels the passkey prompt.
 */
export function useWalletOnboarding() {
  const create = useCreateWallet();
  const connect = useConnectWallet();
  const [phase, setPhase] = useState<PasskeyPhase>("idle");
  const [error, setError] = useState<SembolError | null>(null);
  const [mode, setMode] = useState<"create" | "connect" | null>(null);

  const run = useCallback(async (which: "create" | "connect") => {
    setMode(which); setError(null); setPhase("prompt");
    try {
      if (which === "create") {
        const res = await create.createWallet({ userName: "Koul wallet", nickname: "Koul" });
        setPhase("success");
        return res;
      }
      const res = await connect.connect({ fresh: true });
      if (!res) { setPhase("error"); setError(toSembolError(new Error("No wallet found for that passkey"))); return null; }
      setPhase("success");
      return res;
    } catch (err) {
      const e = toSembolError(err);
      setError(e);
      setPhase(e.code === "user_cancelled" ? "cancelled" : "error");
      return null;
    }
  }, [create, connect]);

  // Sembol reports the sub-step of creation; surface it while we are in flight.
  const livePhase: PasskeyPhase = phase === "prompt" && mode === "create" && create.phase ? (create.phase === "passkey" ? "prompt" : create.phase) : phase;
  const reset = useCallback(() => { setPhase("idle"); setError(null); setMode(null); create.reset(); connect.reset(); }, [create, connect]);
  return { run, phase: livePhase, error, mode, reset };
}
