"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { toSembolError, usePasskeyWallet, type SembolError } from "@sembol/passkey-react";
import type { AssembledTransaction, SmartAccountKit, TransactionSuccess } from "smart-account-kit";
import { explorerTx, KOUL } from "@/lib/koul";
import { invalidate } from "@/lib/data/store";
import { shortHash } from "@/lib/format";

export type ActionPhase = "idle" | "building" | "prompt" | "signed" | "submitting" | "success" | "cancelled" | "error";

/**
 * A browser allows one WebAuthn ceremony at a time: starting a second one aborts the first, and both come back as
 * "the operation was not allowed" or "sent an abort signal". Saving rules can run up to three prompts in a row, so
 * the lock is module-wide rather than per hook.
 */
const ceremony = { open: false };
const acquireCeremony = (): boolean => { if (ceremony.open) return false; ceremony.open = true; return true; };
const releaseCeremony = () => { ceremony.open = false; };

/** A dismissed, timed out or aborted prompt is the user saying no, not a failure worth a red toast. */
function isDismissed(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  const text = `${name ?? ""} ${err instanceof Error ? err.message : String(err)}`;
  return /NotAllowedError|AbortError|abort signal|timed out or was not allowed|user_cancelled|cancell?ed/i.test(text);
}

/**
 * The kit gives no progress callback, but its order is fixed: sign, re-simulate, send. Wrapping the two RPC calls
 * for the duration of one submit turns that into phases. Returns the function that restores the originals.
 */
function instrumentRpc(kit: SmartAccountKit, on: { signed: () => void; submitting: () => void }): () => void {
  const rpc = kit.rpc as unknown as { simulateTransaction: (...a: unknown[]) => Promise<unknown>; sendTransaction: (...a: unknown[]) => Promise<unknown> };
  const originalSimulate = rpc.simulateTransaction.bind(kit.rpc);
  const originalSend = rpc.sendTransaction.bind(kit.rpc);
  rpc.simulateTransaction = async (...a: unknown[]) => { on.signed(); return originalSimulate(...a); };
  rpc.sendTransaction = async (...a: unknown[]) => { on.submitting(); return originalSend(...a); };
  return () => { rpc.simulateTransaction = originalSimulate; rpc.sendTransaction = originalSend; };
}

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
  // Sembol's userMessage is deliberately vague ("Something went wrong"). Prefer whatever the chain actually said.
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const detail = describeFailure(err);
  const generic = /something went wrong/i;
  const description = detail && !generic.test(detail) ? detail : raw && !generic.test(raw) ? raw.slice(0, 220) : e.userMessage || e.message;
  console.error(`[koul] ${title}`, err);
  toast.error(title, { description });
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

  const run = useCallback(async <T,>(build: () => Promise<AssembledTransaction<T>>, opts: { title: string; description?: string; invalidatePrefixes?: string[]; quiet?: boolean }): Promise<TransactionSuccess | null> => {
    if (!kit) { toast.error("Wallet not ready"); return null; }
    if (!acquireCeremony()) {
      toast("One at a time", { description: "A passkey prompt is already open. Finish or dismiss it first." });
      return null;
    }
    setError(null); setHash(null); setPhase("building");
    const toastId = toast.loading("Preparing the transaction", { description: opts.title });
    let restore: (() => void) | null = null;
    try {
      const tx = await build();
      setPhase("prompt");
      toast.loading("Waiting for your passkey", { id: toastId, description: "Your device is asking you to confirm." });
      restore = instrumentRpc(kit, {
        signed: () => { setPhase("signed"); toast.loading("Signed. Checking with the network", { id: toastId, description: opts.title }); },
        submitting: () => { setPhase("submitting"); toast.loading("Sending to Stellar", { id: toastId, description: "A few seconds while the ledger closes." }); },
      });
      const res = await kit.signAndSubmit(tx);
      restore();
      restore = null;
      setPhase("submitting");
      if (!res.success) throw new Error(describeFailure(res.error));
      setHash(res.hash);
      setPhase("success");
      toast.dismiss(toastId);
      if (!opts.quiet) toastTx(opts.title, res.hash, opts.description);
      for (const p of opts.invalidatePrefixes ?? []) invalidate(p);
      return res;
    } catch (err) {
      if (restore) restore();
      toast.dismiss(toastId);
      const e = toSembolError(err);
      setError(e);
      const dismissed = e.code === "user_cancelled" || isDismissed(err);
      setPhase(dismissed ? "cancelled" : "error");
      if (dismissed) toast("Nothing was signed", { description: "The passkey prompt was dismissed or timed out. Press the button again when you are ready." });
      else toastError(`${opts.title} failed`, err);
      return null;
    } finally {
      releaseCeremony();
    }
  }, [kit]);

  const reset = useCallback(() => { setPhase("idle"); setError(null); setHash(null); }, []);
  const busy = phase === "building" || phase === "prompt" || phase === "signed" || phase === "submitting";
  return { run, phase, error, hash, busy, reset } as ActionState & { run: typeof run };
}

/** Turn whatever failed into one sentence, naming the contract error when there is one. */
export function describeFailure(err: unknown): string {
  const text = `${err instanceof Error ? err.message : ""} ${(() => { try { return JSON.stringify(err); } catch { return String(err); } })()}`;
  const code = text.match(/Error\(Contract, #(\d+)\)/)?.[1];
  const known: Record<string, string> = {
    "7100": "Koul's policy is not installed on this key",
    "7103": "The policy does not allow that call",
    "7104": "The policy does not allow sending USDC there",
    "7106": "Koul's key hit its rate limit for this window",
    "7107": "The policy parameters were rejected",
    "7108": "That XOXNO account is not the one this key is pinned to",
    "7109": "The policy only lets funds come back to your own wallet",
    "7200": "No rules saved for this wallet yet",
    "7201": "The router rejected these rules",
    "7206": "Nothing moved, so the rule was not applied",
    "112": "The pool does not have enough liquid USDC right now",
    "127": "The pool is at its utilisation ceiling right now",
  };
  if (code && known[code]) return `${known[code]} (contract error ${code})`;
  if (code) return `The contract refused the call with error ${code}`;
  const m = text.match(/"?message"?\s*[:=]\s*"([^"]{4,200})"/);
  if (m) return m[1]!;
  const first = (err instanceof Error ? err.message : "").trim();
  return first ? first.replace(/\s+/g, " ").slice(0, 220) : "";
}

export { KOUL };
