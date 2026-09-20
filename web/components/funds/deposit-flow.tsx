"use client";

/**
 * Deposit lira: amount → live quote → one honest sentence → the timeline. The transfer runs through the funds
 * routes; the waiting step shows the anchor's FAST instructions with the reference and, on the sandbox, a button
 * that simulates the bank leg so the demo does not wait on a real transfer.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/koul/primitives";
import { useFx } from "@/hooks/use-market";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { fmtFx, fmtTry, fmtTryWhole } from "@/lib/format";
import { AmountField } from "./amount-field";
import type { FlowProps } from "./flow-host";
import { DoneCard, PutItToWork, QuoteLine, RunningHeader, StoppedCard } from "./lira-bits";
import { BankInstructions, TransferTimeline } from "./timeline";
import { parseAmount } from "./use-funds";

const CHIPS = [500, 1000, 5000].map((v) => ({ label: fmtTryWhole(v), value: String(v) }));
const MIN_TRY = 100;

export function DepositFlow({ onLockedChange }: FlowProps) {
  const fx = useFx();
  const runner = useTransferRunner();
  const [raw, setRaw] = React.useState("");
  const amountTry = parseAmount(raw);
  const rate = fx.fx.tryPerUsd;
  const amountUsdc = amountTry > 0 && rate > 0 ? amountTry / rate : 0;
  const tooSmall = amountTry > 0 && amountTry < MIN_TRY;
  const t = runner.transfer;
  const running = t?.status === "running";

  React.useEffect(() => { onLockedChange(!!running); return () => onLockedChange(false); }, [running, onLockedChange]);

  const start = () => { if (amountTry >= MIN_TRY && rate > 0) void runner.start("in", { amountTry, amountUsdc, rate }); };

  if (t && t.status === "done") {
    const last = t.steps[t.steps.length - 1];
    return (
      <DoneCard
        transfer={t}
        headline="is in your wallet"
        subline={<>{fmtTry(t.amountTry)} at <span className="num">{fmtFx(t.rate)}</span>{t.reference && <> · reference <span className="num">{t.reference}</span></>}</>}
        hash={last?.txHash}
        secondary={<Button variant="outline" size="lg" className="min-h-11 flex-1 text-[15px]" onClick={runner.reset}>Deposit more</Button>}
        primary={<PutItToWork />}
      />
    );
  }

  if (t) {
    return (
      <div className="flex flex-col gap-6">
        <RunningHeader transfer={t} />
        <TransferTimeline
          transfer={t}
          renderExtra={(s) => {
            if (s.id !== "instructions") return null;
            if (s.state === "active") return (
              <div className="flex flex-col gap-3">
                <BankInstructions amountTry={t.amountTry} reference={t.reference} instructions={t.instructions} />
                <Button variant="outline" size="lg" className="min-h-11 w-full text-[15px]" disabled={runner.busy || !t.transferId} onClick={() => void runner.simulateBank()}>
                  {runner.busy ? "Telling the sandbox…" : "Sandbox: pretend I sent the lira"}
                </Button>
              </div>
            );
            if (s.state === "done" && t.reference) return <div className="text-xs text-muted-foreground">Reference <span className="num text-foreground">{t.reference}</span> · matched by the bank partner</div>;
            return null;
          }}
        />
        {t.status === "failed" && <StoppedCard transfer={t} onRetry={() => { runner.reset(); setTimeout(start, 0); }} onStartOver={runner.reset} />}
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); start(); }}>
      <AmountField
        id="deposit-amount"
        label="Amount in lira"
        unit="TRY"
        value={raw}
        onChange={setRaw}
        chips={CHIPS}
        autoFocus
        error={tooSmall ? `The bank partner takes deposits from ${fmtTryWhole(MIN_TRY)}.` : null}
      />
      <QuoteLine amount={amountUsdc} currency="USDC" fx={fx} />
      <p className="text-sm leading-relaxed text-muted-foreground">
        The bank partner pays a <Term detail="Ownerless classic G-account per transfer, sponsored by the keeper, with pre-authorised forward and cleanup transactions (the Kumbara landing account pattern).">temporary receiving account</Term> that forwards to your wallet on its own. Nothing to sign.
      </p>
      <Button type="submit" size="lg" className="min-h-12 w-full text-[15px]" disabled={amountTry < MIN_TRY || fx.loading || rate <= 0 || runner.busy}>
        Start deposit <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </form>
  );
}
