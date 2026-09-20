"use client";

/**
 * The not-connected state. One panel, two buttons, and a pending state that says exactly what the device is
 * doing. Cancelling the passkey prompt lands on a calm "nothing changed" with a retry.
 */
import * as React from "react";
import { ScanFace, KeyRound, LoaderCircle, Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWalletOnboarding, type PasskeyPhase } from "@/hooks/use-wallet";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { Mark } from "./brand";

const PHASE_TEXT: Partial<Record<PasskeyPhase, { title: string; body: string }>> = {
  prompt: { title: "Waiting for your passkey", body: "Your device is asking you to confirm. Nothing happens on-chain until you approve." },
  deploying: { title: "Creating your wallet on Stellar", body: "Deploying a smart account tied to your passkey. About ten seconds." },
  funding: { title: "Adding test XLM", body: "Friendbot is topping up the new wallet so you can try everything." },
  submitting: { title: "Almost there", body: "Waiting for the network to confirm." },
};

export function ConnectPanel({ className, onDone, compact = false }: { className?: string; onDone?: () => void; compact?: boolean }) {
  const ob = useWalletOnboarding();
  const busy = ob.phase === "prompt" || ob.phase === "deploying" || ob.phase === "funding" || ob.phase === "submitting";
  React.useEffect(() => { if (ob.phase === "success") onDone?.(); }, [ob.phase, onDone]);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-card", compact ? "p-5" : "p-6 sm:p-8", className)}>
      {!busy && ob.phase !== "success" && (
        <>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-clay-soft text-clay"><ScanFace className="size-5" aria-hidden /></div>
            <div>
              <h2 className="display text-2xl leading-tight">Sign in with your passkey</h2>
              <p className="text-sm text-muted-foreground">Your passkey creates the wallet, with whatever your device uses: a face, a fingerprint or a password manager. Nothing to write down.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" className="min-h-12 flex-1 text-[15px]" onClick={() => void ob.run("create")}>
              <ScanFace data-icon="inline-start" /> Create wallet
            </Button>
            <Button size="lg" variant="outline" className="min-h-12 flex-1 text-[15px]" onClick={() => void ob.run("connect")}>
              <KeyRound data-icon="inline-start" /> I already have one
            </Button>
          </div>
          {ob.phase === "cancelled" && <p role="status" className="mt-3 text-sm text-warning">Cancelled, nothing changed. Tap a button to try again.</p>}
          {ob.phase === "error" && <p role="alert" className="mt-3 text-sm text-negative">{ob.error?.userMessage || ob.error?.message || "That did not work."} You can try again.</p>}
          {!compact && (
            <ul className="mt-6 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />Your money stays in your own wallet, always.</li>
              <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />Fees on testnet are covered for you.</li>
              <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />Passkeys live on this device and never leave it.</li>
            </ul>
          )}
        </>
      )}
      {busy && (
        <div className="flex flex-col items-center py-4 text-center" role="status" aria-live="polite">
          <div className="relative mb-5 flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-breathe rounded-full bg-clay-soft" aria-hidden />
            {ob.phase === "prompt" ? <ScanFace className="relative size-7 text-clay" aria-hidden /> : <LoaderCircle className="relative size-7 animate-spin text-clay" aria-hidden />}
          </div>
          <div className="display text-2xl">{PHASE_TEXT[ob.phase]?.title}</div>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{PHASE_TEXT[ob.phase]?.body}</p>
          <Steps phase={ob.phase} creating={ob.mode === "create"} />
        </div>
      )}
      {ob.phase === "success" && (
        <div className="flex flex-col items-center py-4 text-center" role="status">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-positive-soft text-positive"><Check className="size-6" aria-hidden /></div>
          <div className="display text-2xl">You are in</div>
          <p className="mt-1 text-sm text-muted-foreground">Your wallet is live on Stellar testnet.</p>
        </div>
      )}
      <Mark className="absolute -right-6 -bottom-6 size-32 text-foreground/[0.04]" />
    </div>
  );
}

function Steps({ phase, creating }: { phase: PasskeyPhase; creating: boolean }) {
  if (!creating) return null;
  const order: PasskeyPhase[] = ["prompt", "deploying", "funding"];
  const idx = order.indexOf(phase);
  return (
    <ol className="mt-5 flex items-center gap-2" aria-label="Progress">
      {["Passkey", "Deploy", "Fund"].map((l, i) => (
        <li key={l} className="flex items-center gap-2 text-[11px] uppercase tracking-wider">
          <span className={cn("size-1.5 rounded-full", i < idx ? "bg-positive" : i === idx ? "bg-clay animate-breathe" : "bg-foreground/15")} aria-hidden />
          <span className={i <= idx ? "text-foreground" : "text-muted-foreground"}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

export function ConnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Connect" description="A passkey is your wallet. No seed phrase." width="md:max-w-[460px]">
      <ConnectPanel compact className="border-0 bg-transparent p-0" onDone={() => setTimeout(() => onOpenChange(false), 900)} />
    </ResponsiveSheet>
  );
}

/**
 * Wraps a page body. Not connected: the connect panel on top and the body beneath it as a sample preview, so the
 * screen still shows what it is for. Connected: just the body.
 */
export function RequireWallet({ connected, initializing, children, previewLabel = "What you will see here, with sample data" }: { connected: boolean; initializing: boolean; children: React.ReactNode; previewLabel?: string }) {
  if (initializing) return <div className="skeleton h-40 rounded-2xl" aria-busy />;
  if (connected) return <>{children}</>;
  return (
    <div>
      <ConnectPanel className="mb-8" />
      <div className="mb-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />{previewLabel}<span className="h-px flex-1 bg-border" />
      </div>
      <div className="opacity-80" aria-label="Preview with sample data">{children}</div>
    </div>
  );
}
