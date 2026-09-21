"use client";

/**
 * Deposit by bank: an amount in lira, a quote at the oracle rate, then the transfer the anchor opened: IBAN,
 * reference and amount to copy, and the waiting state that turns into "arrived". A transfer left running is picked
 * up again from local storage.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { CopyRow, KeyValue, Label, PillButton, Sk, Tile } from "@/components/signal";
import { useFx } from "@/hooks/use-market";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { fmtFx, fmtLira, fmtLiraWhole, fmtUsdc } from "@/lib/format";
import type { Transfer } from "@/lib/data/types";
import { AmountInput, parseAmount } from "./amount-input";
import { FlowFrame, type Method } from "./flow-frame";
import { Steps } from "./steps";

const STEP_LABELS = ["Verified", "Send", "Convert", "Arrives"];

/** The anchor names its instruction fields; find the IBAN and the reference whatever they are called. */
function pick(instructions: Transfer["instructions"], keys: string[]): string | null {
  if (!instructions) return null;
  for (const k of keys) {
    const v = instructions[k]?.value;
    if (v) return v;
  }
  return null;
}

export function DepositBank({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const router = useRouter();
  const fx = useFx();
  const runner = useTransferRunner();
  const [amount, setAmount] = React.useState("");
  const lira = parseAmount(amount);
  const rate = fx.loading || fx.fx.tryPerUsd <= 0 ? null : fx.fx.tryPerUsd;
  const usdc = rate && lira ? lira / rate : null;

  // A deposit left running comes back on its own.
  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    runner.resume();
  }, [runner]);

  const t = runner.transfer;
  if (t && t.direction === "in") {
    const active = t.steps.findIndex((s) => s.state === "active");
    const stepIndex = t.status === "done" ? STEP_LABELS.length : t.status === "failed" ? Math.max(0, active) : Math.max(1, active);
    const iban = pick(t.instructions, ["bank_account_number", "iban", "account_number"]);
    const reference = t.reference ?? pick(t.instructions, ["reference", "memo", "payment_reference", "description"]);
    const bank = pick(t.instructions, ["bank_name"]);
    const waiting = t.status === "running" && active === 1;
    const converting = t.status === "running" && active >= 2;
    return (
      <FlowFrame
        title={t.status === "done" ? `${fmtUsdc(t.amountUsdc)} USDC arrived` : `Send ${fmtLiraWhole(t.amountTry)}`}
        action={<PillButton variant={t.status === "done" ? "lime" : "outline"} size="lg" full onClick={() => { if (t.status !== "running") runner.reset(); router.push("/"); }}>Done</PillButton>}
      >
        <Tile className="grid gap-5">
          <Steps labels={STEP_LABELS} active={stepIndex} failed={t.status === "failed"} />
          {t.status !== "done" && (
            <div className="divide-y divide-line rounded-[var(--radius-group)] border border-line">
              {iban ? <CopyRow label="IBAN" value={iban} /> : <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24">IBAN</Label><Sk className="h-4 w-48" /></div>}
              {reference ? <CopyRow label="Reference" value={reference} /> : <div className="flex min-h-14 items-center gap-4 px-4"><Label className="w-24">Reference</Label><Sk className="h-4 w-32" /></div>}
              <CopyRow label="Amount" value={t.amountTry.toFixed(2)} display={fmtLira(t.amountTry)} />
            </div>
          )}
          {bank && t.status !== "done" && <Label>{bank}</Label>}
          <div role="status" aria-live="polite" className="grid gap-2">
            {waiting && <Label tone="lime">Waiting for your transfer</Label>}
            {converting && <Label tone="lime" className="animate-blink">Lira received · converting to USDC</Label>}
            {t.status === "done" && <Label tone="lime">Arrived · {fmtUsdc(t.amountUsdc)} USDC in your wallet</Label>}
            {t.status === "failed" && <Label tone="danger">{t.steps[active]?.detail ?? "The transfer stopped"}</Label>}
            {waiting && <p className="text-[15px] text-muted">You can leave this page. The deposit shows up in Activity when it lands.</p>}
          </div>
          {waiting && (
            <PillButton variant="ghost" onClick={() => void runner.simulateBank()} disabled={runner.busy} aria-busy={runner.busy}>{runner.busy ? "Telling the sandbox" : "Sandbox · pretend I sent the lira"}</PillButton>
          )}
        </Tile>
      </FlowFrame>
    );
  }

  const canContinue = lira > 0 && !runner.busy;
  return (
    <FlowFrame
      title="Deposit"
      method={method}
      onMethod={onMethod}
      action={<PillButton size="lg" full disabled={!canContinue} aria-busy={runner.busy} onClick={() => void runner.start("in", { amountTry: lira, amountUsdc: usdc ?? 0, rate: rate ?? 0 })}>{runner.busy ? "Opening the transfer" : "Continue"}</PillButton>}
    >
      <Tile className="grid gap-5">
        <AmountInput value={amount} onChange={setAmount} unit="TRY" autoFocus />
        <div className="divide-y divide-line">
          <KeyValue label="You get" value={usdc === null ? (lira ? <Sk className="h-4 w-24" /> : "—") : `≈ ${fmtUsdc(usdc)} USDC`} />
          <KeyValue label="Rate" value={rate === null ? <Sk className="h-4 w-16" /> : fmtFx(rate)} />
          <KeyValue label="Anchor fee" value="—" tone="dim" />
          <KeyValue label="Network fee" value="FREE" />
        </div>
        {t?.status === "failed" && <Label tone="danger">{t.steps.find((s) => s.state === "failed")?.detail ?? "The transfer stopped"}</Label>}
      </Tile>
    </FlowFrame>
  );
}
