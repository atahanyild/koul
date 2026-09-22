"use client";

/**
 * Withdraw to bank: an amount in USDC and an IBAN, a quote, then the transfer the anchor opened. One passkey
 * moves the USDC out of the wallet; the server carries the lira to the bank and reports when it is paid.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyValue, Label, PillButton, Sk, Tile } from "@/components/signal";
import { useFx } from "@/hooks/use-market";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { fmtFx, fmtLira, fmtUsdc } from "@/lib/format";
import { AmountInput, parseAmount } from "./amount-input";
import { FlowFrame, type Method } from "./flow-frame";
import { Steps } from "./steps";

const STEP_LABELS = ["Quoted", "Approve", "Paying", "Done"];
const IBAN = /^TR\d{24}$/;

export function WithdrawBank({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const router = useRouter();
  const fx = useFx();
  const pf = usePortfolio();
  const runner = useTransferRunner();
  const [amount, setAmount] = React.useState("");
  const [iban, setIban] = React.useState("");
  const usdc = parseAmount(amount);
  const available = pf.loaded ? pf.positions.idleUsdc : null;
  const rate = fx.loading || fx.fx.tryPerUsd <= 0 ? null : fx.fx.tryPerUsd;
  const lira = rate && usdc ? usdc * rate : null;
  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  const ibanOk = IBAN.test(cleanIban);
  const tooMuch = available !== null && usdc > available;

  const resumed = React.useRef(false);
  React.useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    runner.resume();
  }, [runner]);

  const t = runner.transfer;
  if (t && t.direction === "out") {
    const active = t.steps.findIndex((s) => s.state === "active");
    const stepIndex = t.status === "done" ? STEP_LABELS.length : t.status === "failed" ? Math.max(0, active) : Math.max(1, active);
    const approving = t.status === "running" && active === 1;
    const paying = t.status === "running" && active >= 2;
    const phase = runner.approveAction.phase;
    const approveLabel = phase === "prompt" ? "Confirm with your passkey" : phase === "signed" || phase === "submitting" ? "Sending to Stellar" : "Approve with your passkey";
    return (
      <FlowFrame
        title={t.status === "done" ? `${fmtLira(t.amountTry)} sent` : `Withdraw ${fmtUsdc(t.amountUsdc)} USDC`}
        action={approving
          ? <PillButton size="lg" full onClick={() => void runner.approve()} disabled={runner.approveAction.busy || !t.unsignedTransfer} aria-busy={runner.approveAction.busy}>{approveLabel}</PillButton>
          : <PillButton variant={t.status === "done" ? "lime" : "outline"} size="lg" full onClick={() => { if (t.status !== "running") runner.reset(); router.push("/"); }}>Done</PillButton>}
      >
        <Tile className="grid gap-5">
          <Steps labels={STEP_LABELS} active={stepIndex} failed={t.status === "failed"} />
          <div className="divide-y divide-line">
            <KeyValue label="You send" value={`${fmtUsdc(t.amountUsdc)} USDC`} />
            <KeyValue label="You get" value={t.amountTry ? fmtLira(t.amountTry) : <Sk className="h-4 w-24" />} tone="lime" />
            <KeyValue label="Rate" value={t.amountTry && t.amountUsdc ? fmtFx(t.amountTry / t.amountUsdc) : "—"} />
          </div>
          <div role="status" aria-live="polite" className="grid gap-2">
            {approving && <Label tone="lime">One passkey confirmation</Label>}
            {approving && <p className="text-[15px] text-muted">The USDC leaves your wallet once you approve. The rest runs on its own.</p>}
            {paying && <Label tone="lime" className="animate-blink">Bank partner is paying your lira</Label>}
            {paying && <p className="text-[15px] text-muted">You can leave this page. The withdrawal shows up in Activity when it lands.</p>}
            {t.status === "done" && <Label tone="lime">Paid · {fmtLira(t.amountTry)} on its way to your bank</Label>}
            {t.status === "failed" && <Label tone="danger">{t.steps[Math.max(0, active)]?.detail ?? "The transfer stopped"}</Label>}
          </div>
        </Tile>
      </FlowFrame>
    );
  }

  const canReview = usdc > 0 && !tooMuch && ibanOk && !runner.busy && rate !== null;
  return (
    <FlowFrame
      title="Withdraw"
      method={method}
      onMethod={onMethod}
      action={<PillButton size="lg" full disabled={!canReview} aria-busy={runner.busy} onClick={() => void runner.start("out", { amountTry: lira ?? 0, amountUsdc: usdc, rate: rate ?? 0, iban: cleanIban })}>{runner.busy ? "Getting a quote" : "Review"}</PillButton>}
    >
      <Tile className="grid gap-5">
        <AmountInput
          value={amount}
          onChange={setAmount}
          unit="USDC"
          autoFocus
          trailing={<>
            <Label tone={tooMuch ? "danger" : "muted"}>{available === null ? "Available —" : `Available ${fmtUsdc(available)}`}</Label>
            <button type="button" className="label min-h-11 rounded-full px-2 text-accent-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent-text" onClick={() => available !== null && setAmount(String(Math.floor(available * 100) / 100))} disabled={available === null || available <= 0}>Max</button>
          </>}
        />
        <div>
          <label htmlFor="iban" className="t-tile-label text-muted">To</label>
          <input
            id="iban"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="Your IBAN"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={iban.length > 0 && !ibanOk}
            className="mono mt-3 h-14 w-full rounded-full border border-line bg-transparent px-5 text-[15px] text-text outline-none placeholder:text-muted focus-visible:border-accent-text"
          />
          {iban.length > 0 && !ibanOk && <Label tone="danger" className="mt-2 block">A Turkish IBAN: TR and 24 digits</Label>}
        </div>
        <div className="divide-y divide-line">
          <KeyValue label="You get" value={lira === null ? (usdc ? <Sk className="h-4 w-24" /> : "—") : `≈ ${fmtLira(lira)}`} />
          <KeyValue label="Rate" value={rate === null ? <Sk className="h-4 w-16" /> : fmtFx(rate)} />
          <KeyValue label="Anchor fee" value="—" tone="muted" />
        </div>
        {t?.status === "failed" && <Label tone="danger">{t.steps.find((s) => s.state === "failed")?.detail ?? "The transfer stopped"}</Label>}
        <Label className="text-center">One passkey confirmation</Label>
      </Tile>
    </FlowFrame>
  );
}
