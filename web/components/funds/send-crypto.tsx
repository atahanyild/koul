"use client";

/**
 * Send crypto: a real passkey-signed transfer through Sembol's `useTransfer`. Asset, recipient (StrKey-checked),
 * amount with Max, and the fee line. Cancelling lands on "nothing changed" with a retry.
 */
import * as React from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { toSembolError, useTransfer } from "@sembol/passkey-react";
import { ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PasskeyButton, PasskeyHint } from "@/components/koul/passkey-button";
import { Money, Term, TxLink } from "@/components/koul/primitives";
import { ConnectPanel } from "@/components/shell/connect-panel";
import { toastError, toastTx, type ActionPhase } from "@/hooks/use-passkey-action";
import { useWallet } from "@/hooks/use-wallet";
import { invalidate } from "@/lib/data/store";
import { XOXNO } from "@/lib/koul";
import { fmtUsdc, shortAddress } from "@/lib/format";
import { AmountField } from "./amount-field";
import type { FlowProps } from "./flow-host";
import { parseAmount } from "./use-funds";

type Asset = "USDC" | "XLM";
const SAMPLE = { USDC: 30, XLM: 412.5 } as const;
const isStellarAddress = (v: string) => StrKey.isValidEd25519PublicKey(v) || StrKey.isValidContract(v);

export function SendCrypto({ onLockedChange }: FlowProps) {
  const w = useWallet();
  const tx = useTransfer();
  const [asset, setAsset] = React.useState<Asset>("USDC");
  const [to, setTo] = React.useState("");
  const [raw, setRaw] = React.useState("");
  const [sent, setSent] = React.useState<{ amount: number; asset: Asset; to: string; hash: string } | null>(null);

  const balance = w.isConnected ? (asset === "USDC" ? w.usdc : w.xlm) : SAMPLE[asset];
  const amount = parseAmount(raw);
  const recipient = to.trim();
  const toOk = recipient.length > 0 && isStellarAddress(recipient);
  const overBalance = balance !== null && amount > balance;
  const self = w.address !== null && recipient === w.address;

  const phase: ActionPhase =
    tx.status === "signing" ? "prompt"
    : tx.status === "submitting" ? "submitting"
    : tx.status === "success" ? "success"
    : tx.status === "error" ? (tx.error?.code === "user_cancelled" ? "cancelled" : "error")
    : "idle";
  const busy = phase === "prompt" || phase === "submitting";
  React.useEffect(() => { onLockedChange(busy); return () => onLockedChange(false); }, [busy, onLockedChange]);

  const canSend = w.isConnected && toOk && amount > 0 && !overBalance && !self && !busy;

  const send = async () => {
    if (!canSend) return;
    try {
      const res = await tx.transfer({ to: recipient, amount: raw, token: asset === "USDC" ? { contractId: XOXNO.usdc } : "native" });
      toastTx(`Sent ${fmtUsdc(amount)} ${asset}`, res.hash, `To ${shortAddress(recipient)}`);
      setSent({ amount, asset, to: recipient, hash: res.hash });
      invalidate("positions:");
      void w.refetchBalances();
    } catch (err) {
      if (toSembolError(err).code !== "user_cancelled") toastError("Send failed", err);
    }
  };

  const again = () => { tx.reset(); setSent(null); setRaw(""); setTo(""); };

  if (sent) {
    return (
      <div className="animate-rise flex flex-col items-center py-2 text-center" role="status" aria-live="polite">
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-positive-soft text-positive"><Check className="size-6" strokeWidth={2.5} aria-hidden /></div>
        <Money value={sent.amount} currency={sent.asset} size="hero" animate={false} />
        <div className="display mt-3 text-2xl leading-tight">sent</div>
        <p className="mt-1.5 text-sm text-muted-foreground">To <span className="mono text-foreground">{shortAddress(sent.to, 8, 6)}</span>. It is on Stellar now.</p>
        <TxLink hash={sent.hash} className="mt-3 text-sm">See it on stellar.expert</TxLink>
        <Button variant="outline" size="lg" className="mt-6 min-h-11 w-full text-[15px]" onClick={again}>Send another</Button>
      </div>
    );
  }

  const recipientError = recipient.length > 0 && !toOk ? "A Stellar address is 56 characters and starts with G or C." : self ? "That is this wallet." : null;

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <Tabs value={asset} onValueChange={(v) => { setAsset(v as Asset); setRaw(""); }}>
        <TabsList className="h-11 w-full" aria-label="Asset">
          <TabsTrigger value="USDC" className="min-h-9 text-[15px]" disabled={busy}>USDC</TabsTrigger>
          <TabsTrigger value="XLM" className="min-h-9 text-[15px]" disabled={busy}>XLM</TabsTrigger>
        </TabsList>
      </Tabs>

      <div>
        <label htmlFor="send-to" className="text-sm font-medium">To</label>
        <Input
          id="send-to"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          placeholder="G… or C…"
          aria-invalid={recipientError ? true : undefined}
          aria-describedby="send-to-hint"
          className="num mt-2 h-11 px-3.5 text-[15px] md:text-[15px]"
        />
        <p id="send-to-hint" className={recipientError ? "mt-1.5 text-xs text-negative" : "mt-1.5 text-xs text-muted-foreground"} role={recipientError ? "alert" : undefined}>
          {recipientError ?? <>A Stellar account (G…) or a contract wallet (C…). <Term detail="StrKey.isValidEd25519PublicKey or StrKey.isValidContract; the SAC transfer accepts either as the destination.">Checked before you sign</Term>.</>}
        </p>
      </div>

      <AmountField
        id="send-amount"
        label="Amount"
        unit={asset}
        value={raw}
        onChange={setRaw}
        disabled={busy}
        hint={
          balance === null ? <span className="skeleton inline-block h-3 w-24 align-middle" aria-busy /> : (
            <span className="inline-flex items-center gap-2">
              <span>Available <span className="num text-foreground">{fmtUsdc(balance)}</span> {asset}</span>
              <button type="button" disabled={busy || balance <= 0} onClick={() => setRaw(String(balance))} className="num rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-saffron hover:bg-saffron-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50">Max</button>
            </span>
          )
        }
        error={overBalance ? `That is more than the ${fmtUsdc(balance ?? 0)} ${asset} in your wallet.` : null}
      />

      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground">Network fee</span>
        <span className="text-right">Covered by the <Term detail="Sembol's relayer submits the fee-bumped transaction; the wallet pays 0 XLM on testnet.">relayer</Term> on testnet</span>
      </div>

      {w.isConnected ? (
        <div className="flex flex-col gap-2">
          <PasskeyButton type="submit" phase={phase} disabled={!canSend && !busy} className="w-full">
            <span className="inline-flex items-center gap-2"><ArrowUpRight className="size-4" aria-hidden /> Send {amount > 0 ? `${fmtUsdc(amount)} ${asset}` : asset}</span>
          </PasskeyButton>
          <PasskeyHint phase={phase} error={tx.error} onRetry={() => void send()} />
        </div>
      ) : (
        <ConnectPanel compact />
      )}
    </form>
  );
}
