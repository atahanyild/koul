"use client";

/**
 * Withdraw lira: USDC amount, IBAN, quote, then the timeline. Step two waits on the user: a passkey button inside
 * the step. The landing-account flow lives in keeper scripts today, so the confirmation is simulated with the
 * same phases the real one shows (prompt → sending → done) and the chip says so.
 */
import * as React from "react";
import { ArrowRight, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasskeyButton, PasskeyHint } from "@/components/koul/passkey-button";
import type { ActionPhase } from "@/hooks/use-passkey-action";
import { useFx } from "@/hooks/use-market";
import { useTransferRunner } from "@/hooks/use-transfer-runner";
import { useWallet } from "@/hooks/use-wallet";
import { fmtUsdc, shortAddress } from "@/lib/format";
import { AmountField } from "./amount-field";
import type { FlowProps } from "./flow-host";
import { DoneCard, QuoteLine, RunningHeader, StoppedCard } from "./lira-bits";
import { SAMPLE_IBAN, TransferTimeline } from "./timeline";
import { parseAmount } from "./use-funds";

const SAMPLE_USDC = 30;
const isIban = (v: string) => /^TR\d{24}$/.test(v.replace(/\s/g, "").toUpperCase());
/** "TR33 0006 …" as the user types. */
const groupIban = (v: string) => v.replace(/\s/g, "").toUpperCase().slice(0, 26).replace(/(.{4})/g, "$1 ").trim();

export function WithdrawFlow({ onLockedChange, onClose }: FlowProps) {
  const w = useWallet();
  const fx = useFx();
  const runner = useTransferRunner();
  const balance = w.isConnected ? w.usdc : SAMPLE_USDC;
  const [raw, setRaw] = React.useState("");
  const [iban, setIban] = React.useState(SAMPLE_IBAN);
  const amountUsdc = parseAmount(raw);
  const rate = fx.fx.tryPerUsd;
  const amountTry = amountUsdc * rate;
  const overBalance = balance !== null && amountUsdc > balance;
  const ibanOk = isIban(iban);
  const t = runner.transfer;
  const running = t?.status === "running";
  const cont = React.useRef(runner.continueFrom);
  cont.current = runner.continueFrom;

  React.useEffect(() => { onLockedChange(!!running); return () => onLockedChange(false); }, [running, onLockedChange]);

  const chips = [
    { label: "10", value: "10" },
    { label: "50", value: "50" },
    ...(balance !== null && balance > 0 ? [{ label: `All · ${fmtUsdc(balance)}`, value: String(balance) }] : []),
  ];
  const canStart = amountUsdc > 0 && !overBalance && ibanOk && rate > 0 && !fx.loading;
  const start = () => { if (canStart) runner.start("out", amountTry, amountUsdc, rate); };
  const ibanShort = shortAddress(iban.replace(/\s/g, ""), 4, 4);

  if (t && t.status === "done") {
    const last = t.steps[t.steps.length - 1];
    return (
      <DoneCard
        transfer={t}
        headline="is on its way to your bank"
        subline={<>To <span className="num">{ibanShort}</span> via FAST{t.reference && <> · <span className="num">{t.reference}</span></>}. It shows on your statement with that reference.</>}
        hash={last?.txHash}
        secondary={<Button variant="outline" size="lg" className="min-h-11 flex-1 text-[15px]" onClick={runner.reset}>Withdraw more</Button>}
        primary={<Button size="lg" className="min-h-11 flex-1 text-[15px]" onClick={onClose}>Done</Button>}
      />
    );
  }

  if (t) {
    return (
      <div className="flex flex-col gap-6">
        <RunningHeader transfer={t} />
        <TransferTimeline
          transfer={t}
          renderExtra={(s, i) => {
            if (s.id !== "approve") return null;
            if (s.state === "active") return <ApproveStep amountUsdc={t.amountUsdc} onApproved={() => cont.current(i + 1)} />;
            if (s.state === "done") return <div className="text-xs text-muted-foreground">Signed with Face ID · {fmtUsdc(t.amountUsdc)} USDC left your wallet</div>;
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
        id="withdraw-amount"
        label="Amount in USDC"
        unit="USDC"
        value={raw}
        onChange={setRaw}
        chips={chips}
        autoFocus
        hint={balance === null ? <span className="skeleton inline-block h-3 w-24 align-middle" aria-busy /> : <>Available <span className="num text-foreground">{fmtUsdc(balance)}</span> USDC</>}
        error={overBalance ? `That is more than the ${fmtUsdc(balance ?? 0)} USDC in your wallet.` : null}
      />
      <div>
        <label htmlFor="withdraw-iban" className="text-sm font-medium">To your bank</label>
        <Input
          id="withdraw-iban"
          value={iban}
          onChange={(e) => setIban(groupIban(e.target.value))}
          autoComplete="off"
          spellCheck={false}
          placeholder="TR00 0000 0000 0000 0000 0000 00"
          aria-invalid={iban.length > 0 && !ibanOk ? true : undefined}
          aria-describedby="withdraw-iban-hint"
          className="num mt-2 h-11 px-3.5 text-[15px] md:text-[15px]"
        />
        <p id="withdraw-iban-hint" className={iban.length > 0 && !ibanOk ? "mt-1.5 text-xs text-negative" : "mt-1.5 text-xs text-muted-foreground"}>
          {iban.length > 0 && !ibanOk ? "A Turkish IBAN is TR followed by 24 digits." : "The IBAN the lira lands in. A sample account is filled in for the demo."}
        </p>
      </div>
      <QuoteLine amount={amountTry} currency="TRY" fx={fx} />
      <p className="text-sm leading-relaxed text-muted-foreground">One Face ID confirmation moves the USDC out. The rest runs on its own and ends with lira in your bank.</p>
      <Button type="submit" size="lg" className="min-h-12 w-full text-[15px]" disabled={!canStart}>
        Start withdrawal <ArrowRight data-icon="inline-end" aria-hidden />
      </Button>
    </form>
  );
}

/** The one thing the user does: a passkey prompt, simulated with the real phases and timings. */
function ApproveStep({ amountUsdc, onApproved }: { amountUsdc: number; onApproved: () => void }) {
  const [phase, setPhase] = React.useState<ActionPhase>("idle");
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    if (phase !== "idle" && phase !== "cancelled") return;
    setPhase("prompt");
    timers.current.push(setTimeout(() => {
      setPhase("submitting");
      timers.current.push(setTimeout(() => { setPhase("success"); onApproved(); }, 1000));
    }, 1400));
  };
  return (
    <div className="flex flex-col gap-2">
      <PasskeyButton phase={phase} onClick={run} className="w-full sm:w-auto">
        <span className="inline-flex items-center gap-2"><ScanFace className="size-4" aria-hidden /> Approve with Face ID</span>
      </PasskeyButton>
      <PasskeyHint phase={phase} onRetry={run} />
      {phase === "idle" && <p className="text-xs text-muted-foreground">Sends <span className="num text-foreground">{fmtUsdc(amountUsdc)} USDC</span> to the receiving account. Nothing else is signed.</p>}
    </div>
  );
}
