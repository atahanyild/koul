"use client";

/**
 * Drives a TRY deposit or withdrawal through its steps. The anchor flow itself (landing account, SEP-10/12/38/6)
 * lives in the keeper scripts today, so the browser runs a faithful simulation with realistic timings; the step
 * list, wording and states are the ones a server-backed runner will report. Swap `simulate` for a fetch loop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEPOSIT_STEPS, DEPOSIT_STEP_MS, TX, WITHDRAW_STEPS, WITHDRAW_STEP_MS } from "@/lib/data/mock";
import type { Transfer, TransferStep } from "@/lib/data/types";

const ref = () => `FAST-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

export function useTransferRunner() {
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);

  const advance = useCallback((t: Transfer, index: number, timings: number[]) => {
    const steps: TransferStep[] = t.steps.map((s, i) => ({ ...s, state: i < index ? "done" : i === index ? "active" : "pending", at: i <= index ? (s.at ?? Date.now()) : undefined }));
    const next: Transfer = { ...t, steps, status: index >= steps.length ? "done" : "running" };
    if (index >= steps.length) {
      next.steps = next.steps.map((s) => ({ ...s, state: "done" }));
      setTransfer(next);
      return;
    }
    setTransfer(next);
    const ms = timings[index] ?? 2000;
    // A zero timing means the step waits for the user (Face ID) and is advanced explicitly.
    if (ms > 0) timer.current = setTimeout(() => advance(next, index + 1, timings), ms);
  }, []);

  const start = useCallback((direction: "in" | "out", amountTry: number, amountUsdc: number, rate: number) => {
    clear();
    const base = direction === "in" ? DEPOSIT_STEPS : WITHDRAW_STEPS;
    const hashes = [TX.cleanup, undefined, undefined, TX.anchorPay, TX.transfer];
    const t: Transfer = {
      id: `${direction}-${Date.now()}`,
      direction,
      amountTry,
      amountUsdc,
      rate,
      reference: null,
      startedAt: Date.now(),
      status: "running",
      steps: base.map((s, i) => ({ ...s, state: "pending", txHash: direction === "in" ? hashes[i] : [undefined, TX.transfer, TX.anchorPay, TX.cleanup][i] })),
    };
    setTransfer(t);
    const timings = direction === "in" ? DEPOSIT_STEP_MS : WITHDRAW_STEP_MS;
    // Reference appears once the anchor opened the transfer (step 3 on deposit, step 1 on withdrawal).
    const withRef: Transfer = { ...t, reference: ref() };
    timer.current = setTimeout(() => advance(withRef, 0, timings), 200);
  }, [advance]);

  /** For the withdrawal's Face ID step: the caller resolves the passkey, then continues. */
  const continueFrom = useCallback((index: number) => {
    if (!transfer) return;
    advance(transfer, index, transfer.direction === "in" ? DEPOSIT_STEP_MS : WITHDRAW_STEP_MS);
  }, [transfer, advance]);

  const fail = useCallback((index: number, reason: string) => {
    clear();
    setTransfer((t) => t ? { ...t, status: "failed", steps: t.steps.map((s, i) => (i === index ? { ...s, state: "failed", detail: reason } : s)) } : t);
  }, []);

  const reset = useCallback(() => { clear(); setTransfer(null); }, []);
  const activeIndex = transfer ? transfer.steps.findIndex((s) => s.state === "active") : -1;
  return { transfer, start, continueFrom, fail, reset, activeIndex };
}
