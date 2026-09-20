"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { toSembolError, usePasskeyWallet, type SembolError } from "@sembol/passkey-react";
import type { AssembledTransaction, TransactionSuccess } from "smart-account-kit";
import { explorerTx, KOUL } from "@/lib/koul";
import { invalidate } from "@/lib/data/store";
import { shortHash } from "@/lib/format";

export type ActionPhase = "idle" | "building" | "prompt" | "submitting" | "success" | "cancelled" | "error";

export interface ActionState {
  phase: ActionPhase;
  error: SembolError | null;
  hash: string | null;
  busy: boolean;
  reset: () => void;
}

/** Fire a success toast with a stellar.expert link. Every on-chain action ends here. */
export function toastTx(title: string, hash: string, description?: string) {
  toast.success(title, {
    description: description ?? `Transaction ${shortHash(hash)}`,
    action: { label: "View on stellar.expert", onClick: () => window.open(explorerTx(hash), "_blank", "noopener") },
    duration: 8000,
  });
}

export function toastError(title: string, err: unknown) {
  const e = toSembolError(err);
  if (e.code === "user_cancelled") { toast("Cancelled", { description: "No passkey was used. Nothing changed." }); return; }
  toast.error(title, { description: e.userMessage || e.message });
}

/**
 * One passkey-signed action with a status machine: building the transaction, waiting for the passkey, submitting,
 * then success or a recoverable cancel. `run` takes a builder so the prompt only opens once the tx is ready.
 */
export function usePasskeyAction() {
  const { kit } = usePasskeyWallet();
  const [phase, setPhase] = useState<ActionPhase>("idle");
  const [error, setError] = useState<SembolError | null>(null);
  const [hash, setHash] = useState<string | null>(null);

  const run = useCallback(async <T,>(build: () => Promise<AssembledTransaction<T>>, opts: { title: string; description?: string; invalidatePrefixes?: string[] } ): Promise<TransactionSuccess | null> => {
    if (!kit) { toast.error("Wallet not ready"); return null; }
    setError(null); setHash(null); setPhase("building");
    try {
      const tx = await build();
      setPhase("prompt");
      const res = await kit.signAndSubmit(tx);
      setPhase("submitting");
      if (!res.success) throw new Error(describeFailure(res.error));
      setHash(res.hash);
      setPhase("success");
      toastTx(opts.title, res.hash, opts.description);
      for (const p of opts.invalidatePrefixes ?? []) invalidate(p);
      return res;
    } catch (err) {
      const e = toSembolError(err);
      setError(e);
      setPhase(e.code === "user_cancelled" ? "cancelled" : "error");
      toastError(`${opts.title} failed`, err);
      return null;
    }
  }, [kit]);

  const reset = useCallback(() => { setPhase("idle"); setError(null); setHash(null); }, []);
  const busy = phase === "building" || phase === "prompt" || phase === "submitting";
  return { run, phase, error, hash, busy, reset } as ActionState & { run: typeof run };
}

function describeFailure(err: unknown): string {
  const s = JSON.stringify(err);
  const code = s.match(/Error\(Contract, #(\d+)\)/)?.[1];
  const known: Record<string, string> = {
    "7200": "No rules saved for this wallet yet",
    "7201": "The router rejected these rules",
    "7202": "No idle USDC in the wallet",
    "7203": "The oracle has no price",
    "7204": "The oracle price is stale",
  };
  if (code && known[code]) return known[code];
  return s.slice(0, 200);
}

export { KOUL };
