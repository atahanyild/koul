"use client";

/**
 * The transfer timeline: a thin progress bar, then one row per step with a marker (done / breathing / pending /
 * failed), the plain detail while active, a "waiting for …" pill with a live timer when the step depends on
 * something outside Koul, a timestamp and an explorer link once done, and the technical detail one tap away.
 */
import * as React from "react";
import { Check, X } from "lucide-react";
import type { Transfer, TransferStep } from "@/lib/data/types";
import { LiveDot, Pill, Term, TxLink } from "@/components/koul/primitives";
import { fmtTime, fmtTry } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { useElapsed, fmtElapsed } from "./use-funds";

export function TransferProgress({ transfer, className }: { transfer: Transfer; className?: string }) {
  const total = transfer.steps.length;
  const done = transfer.steps.filter((s) => s.state === "done").length;
  const active = transfer.steps.some((s) => s.state === "active");
  const pct = transfer.status === "done" ? 100 : Math.round(((done + (active ? 0.45 : 0)) / total) * 100);
  const tone = transfer.status === "failed" ? "bg-negative" : transfer.status === "done" ? "bg-positive" : "bg-saffron";
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Transfer progress" className={cn("h-1 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width,background-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TransferTimeline({ transfer, renderExtra, className }: { transfer: Transfer; renderExtra?: (step: TransferStep, index: number) => React.ReactNode; className?: string }) {
  const active = transfer.steps.find((s) => s.state === "active");
  const status = transfer.status === "done" ? "Done." : transfer.status === "failed" ? "Stopped." : active ? `${active.title}. ${active.detail}` : "";
  return (
    <div className={className}>
      <div className="sr-only" aria-live="polite" role="status">{status}</div>
      <ol className="relative">
        {transfer.steps.map((s, i) => (
          <StepRow key={s.id} step={s} last={i === transfer.steps.length - 1} extra={renderExtra?.(s, i)} />
        ))}
      </ol>
    </div>
  );
}

function StepRow({ step, last, extra }: { step: TransferStep; last: boolean; extra?: React.ReactNode }) {
  const done = step.state === "done";
  const active = step.state === "active";
  const pending = step.state === "pending";
  const failed = step.state === "failed";
  const elapsed = useElapsed(active ? step.at : null);
  return (
    <li aria-current={active ? "step" : undefined} className={cn("relative flex gap-3.5", !last && "pb-6")}>
      {!last && <span aria-hidden className={cn("absolute top-6 bottom-0 left-[9px] w-px", done ? "bg-positive/40" : "bg-border")} />}
      <span className={cn("mt-px flex size-5 shrink-0 items-center justify-center rounded-full", done && "bg-positive-soft text-positive", active && "bg-saffron-soft", pending && "border border-border bg-background", failed && "bg-negative-soft text-negative")} aria-hidden>
        {done && <Check className="size-3" strokeWidth={3} />}
        {active && <LiveDot tone="saffron" />}
        {pending && <span className="size-1.5 rounded-full bg-muted-foreground/40" />}
        {failed && <X className="size-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <Term detail={step.technical} className={cn("text-[15px] leading-5", pending ? "text-muted-foreground" : "text-foreground", active && "font-medium")}>{step.title}</Term>
          {done && step.at && <span className="num text-xs text-muted-foreground">{fmtTime(step.at)}</span>}
        </div>
        {active && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>}
        {failed && <p className="mt-1 text-sm leading-relaxed text-negative">{step.detail}</p>}
        {active && step.waitsOn && (
          <Pill tone="warning" dot pulse className="mt-2.5">
            Waiting for {step.waitsOn}
            <span className="num opacity-80" aria-label={`${elapsed} seconds`}>{fmtElapsed(elapsed)}</span>
          </Pill>
        )}
        {extra && <div className="mt-3">{extra}</div>}
        {done && step.txHash && <TxLink hash={step.txHash} className="mt-1" />}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- the bank card on the deposit's waiting step

/** A sandbox IBAN for the withdrawal form; the anchor sandbox accepts any well-formed Turkish IBAN. */
export const SAMPLE_IBAN = "TR33 0006 1005 1978 6457 8413 26";

export type Instructions = Record<string, { value: string; description?: string }>;

const pick = (ins: Instructions | null, keys: string[]): string | null => {
  if (!ins) return null;
  for (const k of keys) { const v = ins[k]?.value; if (v) return v; }
  return null;
};
const groupIban = (v: string) => v.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();

/** The FAST instructions exactly as the anchor returned them for this transfer. */
export function BankInstructions({ amountTry, reference, instructions }: { amountTry: number; reference: string | null; instructions: Instructions | null }) {
  const iban = pick(instructions, ["bank_account_number", "iban", "account_number"]);
  const name = pick(instructions, ["bank_account_name", "account_holder", "beneficiary", "bank_name"]) ?? "TR Mock Anchor";
  const shown = Object.entries(instructions ?? {}).filter(([k]) => !["bank_account_number", "iban", "account_number", "bank_account_name", "account_holder", "beneficiary", "bank_name", "reference", "memo", "payment_reference", "description"].includes(k));
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 p-4">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">FAST transfer from your bank</div>
      <dl className="mt-1 divide-y divide-border/70">
        <InstructionRow label="Send to">{iban ? <><span className="num text-[13px]">{groupIban(iban)}</span><CopyButton text={iban} label="IBAN" /></> : <span className="skeleton h-5 w-40" aria-busy />}</InstructionRow>
        <InstructionRow label="Recipient"><span className="text-[13px]">{name}</span></InstructionRow>
        <InstructionRow label="Amount"><span className="num text-[13px]">{fmtTry(amountTry)}</span></InstructionRow>
        <InstructionRow label="Reference">
          {reference ? <><span className="num text-base font-medium text-saffron">{reference}</span><CopyButton text={reference} label="reference" /></> : <span className="skeleton h-5 w-24" aria-busy />}
        </InstructionRow>
        {shown.map(([k, v]) => <InstructionRow key={k} label={v.description ?? k.replace(/_/g, " ")}><span className="num text-[13px]">{v.value}</span></InstructionRow>)}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Put the reference in the description field. The bank partner matches it on its own; there is nothing else to do.</p>
    </div>
  );
}

function InstructionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-right">{children}</dd>
    </div>
  );
}
