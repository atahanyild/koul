"use client";

/** A primary action that ends in a passkey prompt: shows what is happening at every phase, never a bare spinner. */
import * as React from "react";
import { ScanFace, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionPhase } from "@/hooks/use-passkey-action";

const LABELS: Record<ActionPhase, string | null> = {
  idle: null,
  building: "Preparing…",
  prompt: "Confirm with your passkey",
  submitting: "Sending to Stellar…",
  success: "Done",
  cancelled: null,
  error: null,
};

export function PasskeyButton({ phase, children, className, size = "lg", variant = "default", ...rest }: React.ComponentProps<typeof Button> & { phase: ActionPhase }) {
  const label = LABELS[phase];
  const busy = phase === "building" || phase === "prompt" || phase === "submitting";
  return (
    <Button size={size} variant={variant} disabled={busy || rest.disabled} aria-busy={busy} className={cn("relative min-h-11 gap-2 px-4 text-[15px]", className)} {...rest}>
      {phase === "prompt" ? <ScanFace className="size-4 animate-breathe" aria-hidden /> : busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : phase === "success" ? <Check className="size-4" aria-hidden /> : null}
      <span>{label ?? children}</span>
    </Button>
  );
}

/** One line under the button that says what to do next when the passkey was cancelled or failed. */
export function PasskeyHint({ phase, error, onRetry }: { phase: ActionPhase; error?: { userMessage?: string; message: string } | null; onRetry?: () => void }) {
  if (phase === "prompt") return <p className="text-xs text-muted-foreground" role="status">Your device is asking you to confirm: a face, a fingerprint, or your password manager.</p>;
  if (phase === "submitting") return <p className="text-xs text-muted-foreground" role="status">Signed. Waiting for the transaction to land (a few seconds).</p>;
  if (phase === "cancelled") return <p className="text-xs text-warning" role="status">Cancelled, nothing changed.{onRetry && <> <button type="button" className="underline underline-offset-2" onClick={onRetry}>Try again</button>.</>}</p>;
  if (phase === "error") return <p className="text-xs text-negative" role="alert">{error?.userMessage || error?.message || "Something went wrong."}{onRetry && <> <button type="button" className="underline underline-offset-2" onClick={onRetry}>Try again</button>.</>}</p>;
  return null;
}
