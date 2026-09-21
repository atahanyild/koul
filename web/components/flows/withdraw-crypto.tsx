"use client";

/** Withdraw with crypto: USDC to any Stellar address, G… or C…, with one passkey. */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { StrKey } from "@stellar/stellar-sdk";
import { KoulWriter } from "@koul/core";
import { KeyValue, Label, PillButton, Sk, Tile } from "@/components/signal";
import { usePasskeyAction } from "@/hooks/use-passkey-action";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useWallet } from "@/hooks/use-wallet";
import { explorerTx, WRITE_CONFIG } from "@/lib/koul";
import { fmtUsdc } from "@/lib/format";
import { AmountInput, parseAmount } from "./amount-input";
import { FlowFrame, type Method } from "./flow-frame";

const writer = new KoulWriter(WRITE_CONFIG);

export function WithdrawCrypto({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const router = useRouter();
  const w = useWallet();
  const pf = usePortfolio();
  const action = usePasskeyAction();
  const [amount, setAmount] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sent, setSent] = React.useState<{ hash: string; amount: number; to: string } | null>(null);
  const usdc = parseAmount(amount);
  const available = pf.loaded ? pf.positions.idleUsdc : null;
  const dest = to.trim();
  const destOk = StrKey.isValidEd25519PublicKey(dest) || StrKey.isValidContract(dest);
  const tooMuch = available !== null && usdc > available;
  const busy = action.busy;

  const send = async () => {
    if (!w.address || !destOk || usdc <= 0) return;
    const units = BigInt(Math.round(usdc * 1e7));
    const res = await action.run(() => writer.buildTransfer(w.address!, dest, units), { title: `Sent ${fmtUsdc(usdc)} USDC`, doing: `Sending ${fmtUsdc(usdc)} USDC`, description: `To ${dest.slice(0, 4)}…${dest.slice(-4)}`, invalidatePrefixes: ["portfolio:", "events:"] });
    if (res) { setSent({ hash: res.hash, amount: usdc, to: dest }); void w.refetchBalances(); }
  };

  if (sent) {
    return (
      <FlowFrame title={`${fmtUsdc(sent.amount)} USDC sent`} action={<PillButton size="lg" full onClick={() => router.push("/")}>Done</PillButton>}>
        <Tile className="grid gap-5">
          <div className="divide-y divide-line">
            <KeyValue label="To" value={`${sent.to.slice(0, 6)}…${sent.to.slice(-6)}`} />
            <KeyValue label="Network" value="STELLAR" />
          </div>
          <a href={explorerTx(sent.hash)} target="_blank" rel="noopener noreferrer" className="label inline-flex min-h-11 items-center gap-1 text-accent-text hover:brightness-110">View the transaction <ArrowUpRight className="size-4" /></a>
        </Tile>
      </FlowFrame>
    );
  }

  const canReview = usdc > 0 && !tooMuch && destOk && !busy;
  const label = action.phase === "prompt" ? "Confirm with your passkey" : action.phase === "signed" || action.phase === "submitting" || action.phase === "building" ? "Sending to Stellar" : "Review";
  return (
    <FlowFrame title="Withdraw" method={method} onMethod={onMethod} action={<PillButton size="lg" full disabled={!canReview} aria-busy={busy} onClick={() => void send()}>{label}</PillButton>}>
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
          <label htmlFor="to" className="t-tile-label text-muted">To</label>
          <input
            id="to"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Stellar address, G… or C…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={dest.length > 0 && !destOk}
            className="mono mt-3 h-14 w-full rounded-full border border-line bg-transparent px-5 text-[15px] text-text outline-none placeholder:text-muted focus-visible:border-accent-text"
          />
          {dest.length > 0 && !destOk && <Label tone="danger" className="mt-2 block">Not a Stellar address</Label>}
        </div>
        <div className="divide-y divide-line">
          <KeyValue label="Network" value="STELLAR" />
          <KeyValue label="Network fee" value="FREE" />
        </div>
        {!pf.loaded && <Sk className="h-4 w-32" />}
        <Label className="text-center">One passkey confirmation</Label>
      </Tile>
    </FlowFrame>
  );
}
