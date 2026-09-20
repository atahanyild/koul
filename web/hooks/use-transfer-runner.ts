"use client";

/**
 * Drives a TRY deposit or withdrawal through the funds routes: `POST /api/funds/deposit|withdraw` creates the
 * transfer (landing account, SEP-10/12/38/6), `GET /api/funds/:id` advances it on every poll, and the withdrawal's
 * passkey step signs the unsigned USDC transfer the route returned. The step list maps the server stages.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { contract } from "@stellar/stellar-sdk";
import { usePasskeyWallet } from "@sembol/passkey-react";
import { DEPOSIT_STEPS, WITHDRAW_STEPS, type StepDef } from "@/lib/data/steps";
import type { Transfer, TransferStep } from "@/lib/data/types";
import { KOUL, SIM_SOURCE, XOXNO } from "@/lib/koul";
import { invalidate } from "@/lib/data/store";
import { usePasskeyAction } from "./use-passkey-action";

/** What the funds routes return, see `FundsPublic` in @koul/core/funds. */
export interface FundsPublic {
  transferId: string;
  kind: "deposit" | "withdraw";
  status: "awaiting_bank" | "awaiting_passkey" | "awaiting_anchor" | "forwarding" | "completed" | "failed";
  wallet: string;
  landingAccount: string;
  amountUsdc: string;
  quotedFiat?: string;
  instructions?: Record<string, { value: string; description?: string }>;
  anchorStatus?: string;
  forwardHash?: string;
  cleanupHash?: string;
  error?: string;
  unsignedTransfer?: string;
  /** The sealed server record. Sent back on every call so any instance can carry the transfer on. */
  state?: string;
}

const POLL_MS = 4000;

const stateHeader = (state: string | null | undefined): Record<string, string> => (state ? { "x-koul-transfer-state": state } : {});

/**
 * Opening a transfer creates an account and runs four SEP calls, which can take half a minute. A gateway that gives
 * up in the middle is worth one retry; anything the server itself refused is not, so only 502 and 504 repeat.
 */
async function call<T>(url: string, init?: RequestInit, attempt = 0): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (attempt === 0 && (res.status === 502 || res.status === 504)) return call<T>(url, init, 1);
    throw new Error(body.error ?? `The server answered ${res.status}. ${res.status >= 500 ? "Nothing was signed; try again." : ""}`.trim());
  }
  return body;
}

/** Which step is active for a server record, and which steps are done. */
function stageIndex(f: FundsPublic): number {
  if (f.kind === "deposit") {
    if (f.status === "completed") return DEPOSIT_STEPS.length;
    if (f.status === "awaiting_anchor" || f.status === "forwarding" || f.forwardHash) return 2;
    if (f.anchorStatus && f.anchorStatus !== "pending_user_transfer_start" && f.anchorStatus !== "incomplete") return 2;
    return 1;
  }
  if (f.status === "completed") return WITHDRAW_STEPS.length;
  if (f.status === "awaiting_passkey") return 1;
  return 2;
}

/** The reference the user puts in the bank transfer, whichever key the anchor used for it. */
function referenceOf(instructions: FundsPublic["instructions"]): string | null {
  if (!instructions) return null;
  for (const key of ["reference", "memo", "payment_reference", "description"]) {
    const v = instructions[key]?.value;
    if (v) return v;
  }
  return null;
}

function applyStages(t: Transfer, f: FundsPublic, signedIndex: number | null): Transfer {
  const failed = f.status === "failed";
  const active = failed ? Math.min(stageIndex(f), t.steps.length - 1) : stageIndex(f);
  const hashes: Record<string, string | undefined> = t.direction === "in"
    ? { received: f.forwardHash, arrived: f.cleanupHash }
    : { approve: t.steps.find((s) => s.id === "approve")?.txHash, paying: f.forwardHash, done: f.cleanupHash };
  const steps: TransferStep[] = t.steps.map((s, i) => {
    const done = i < active || (signedIndex !== null && i <= signedIndex && i < active);
    const state: TransferStep["state"] = failed && i === active ? "failed" : done ? "done" : i === active ? "active" : "pending";
    return { ...s, state, at: i <= active ? (s.at ?? Date.now()) : undefined, txHash: hashes[s.id] ?? s.txHash, detail: failed && i === active && f.error ? f.error : s.detail };
  });
  return {
    ...t,
    transferId: f.transferId,
    serverState: f.state ?? t.serverState,
    reference: referenceOf(f.instructions) ?? t.reference,
    instructions: f.instructions ?? t.instructions,
    unsignedTransfer: f.unsignedTransfer ?? t.unsignedTransfer,
    amountTry: t.direction === "out" && f.quotedFiat ? Number(f.quotedFiat) : t.amountTry,
    steps,
    status: failed ? "failed" : active >= t.steps.length ? "done" : "running",
  };
}

export function useTransferRunner() {
  const { address, kit } = usePasskeyWallet();
  const approveAction = usePasskeyAction();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<Transfer | null>(null);
  current.current = transfer;
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);

  const poll = useCallback(async (id: string) => {
    const t = current.current;
    if (!t || t.transferId !== id || t.status !== "running") return;
    try {
      const f = await call<FundsPublic>(`/api/funds/${id}`, { headers: stateHeader(t.serverState) });
      const next = applyStages(t, f, null);
      setTransfer(next);
      if (next.status === "done") invalidate("portfolio:");
      if (next.status === "running") timer.current = setTimeout(() => void poll(id), POLL_MS);
    } catch (err) {
      setTransfer((prev) => prev && prev.transferId === id ? failAt(prev, err) : prev);
    }
  }, []);

  const start = useCallback(async (direction: "in" | "out", input: { amountTry: number; amountUsdc: number; rate: number; iban?: string }) => {
    if (!address) return;
    clear();
    const base: StepDef[] = direction === "in" ? DEPOSIT_STEPS : WITHDRAW_STEPS;
    const t: Transfer = {
      id: `${direction}-${Date.now()}`,
      direction,
      transferId: null,
      serverState: null,
      amountTry: input.amountTry,
      amountUsdc: input.amountUsdc,
      rate: input.rate,
      reference: null,
      instructions: null,
      unsignedTransfer: null,
      startedAt: Date.now(),
      status: "running",
      steps: base.map((s, i) => ({ ...s, state: i === 0 ? "active" : "pending", at: i === 0 ? Date.now() : undefined })),
    };
    setTransfer(t);
    setBusy(true);
    const customer = { first_name: "Koul", last_name: address.slice(-6), email_address: "user@koul.local" };
    try {
      const f = direction === "in"
        ? await call<FundsPublic>("/api/funds/deposit", { method: "POST", body: JSON.stringify({ wallet: address, amountTry: input.amountTry.toFixed(2), customer }) })
        : await call<FundsPublic>("/api/funds/withdraw", { method: "POST", body: JSON.stringify({ wallet: address, amountUsdc: input.amountUsdc.toFixed(7), iban: (input.iban ?? "").replace(/\s/g, "").toUpperCase(), customer }) });
      const next = applyStages(t, f, null);
      setTransfer(next);
      if (next.status === "running" && !(direction === "out" && f.status === "awaiting_passkey")) timer.current = setTimeout(() => void poll(f.transferId), POLL_MS);
    } catch (err) {
      setTransfer(failAt(t, err));
    } finally {
      setBusy(false);
    }
  }, [address, poll]);

  /** Sandbox: tell the mock anchor the bank transfer arrived, then keep polling. */
  const simulateBank = useCallback(async () => {
    const t = current.current;
    if (!t?.transferId) return;
    setBusy(true);
    try {
      await call<FundsPublic>(`/api/funds/${t.transferId}/simulate`, { method: "POST", headers: stateHeader(t.serverState) });
      clear();
      timer.current = setTimeout(() => void poll(t.transferId!), 1500);
    } catch (err) {
      setTransfer((prev) => (prev ? failAt(prev, err) : prev));
    } finally {
      setBusy(false);
    }
  }, [poll]);

  /** The withdrawal's one passkey: sign the USDC transfer to the landing account, then let the server continue. */
  const approve = useCallback(async () => {
    const t = current.current;
    if (!t?.unsignedTransfer || !kit) return null;
    const res = await approveAction.run(async () => {
      const parsed = JSON.parse(t.unsignedTransfer!) as { tx: string; simulationResult: { auth: string[]; retval: string }; simulationTransactionData: string };
      return contract.AssembledTransaction.fromJSON<null>({ contractId: XOXNO.usdc, networkPassphrase: KOUL.networkPassphrase, rpcUrl: KOUL.rpcUrl, publicKey: SIM_SOURCE, method: "transfer", parseResultXdr: () => null }, parsed);
    }, { title: "USDC sent to the receiving account", invalidatePrefixes: ["portfolio:"] });
    if (!res) return null;
    setTransfer((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s) => (s.id === "approve" ? { ...s, state: "done" as const, txHash: res.hash, at: Date.now() } : s.id === "paying" ? { ...s, state: "active" as const, at: Date.now() } : s));
      return { ...prev, steps };
    });
    clear();
    timer.current = setTimeout(() => void poll(t.transferId!), 2000);
    return res;
  }, [kit, approveAction, poll]);

  const reset = useCallback(() => { clear(); setTransfer(null); approveAction.reset(); }, [approveAction]);
  const activeIndex = transfer ? transfer.steps.findIndex((s) => s.state === "active") : -1;
  return { transfer, start, simulateBank, approve, approveAction, reset, activeIndex, busy };
}

function failAt(t: Transfer, err: unknown): Transfer {
  const i = Math.max(0, t.steps.findIndex((s) => s.state === "active"));
  const reason = err instanceof Error ? err.message : String(err);
  return { ...t, status: "failed", steps: t.steps.map((s, k) => (k === i ? { ...s, state: "failed", detail: reason } : s)) };
}
