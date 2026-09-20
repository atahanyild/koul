"use client";

/** Receive crypto: the address as a QR code and as text, one copy button. Connect first when there is no wallet. */
import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Address, Term } from "@/components/koul/primitives";
import { ConnectPanel } from "@/components/shell/connect-panel";
import { useWallet } from "@/hooks/use-wallet";

export function ReceiveCrypto() {
  const w = useWallet();
  if (!w.isConnected || !w.address) {
    return (
      <div className="flex flex-col gap-3">
        <ConnectPanel compact />
        <p className="text-xs text-muted-foreground">Once you are in, your address and a QR code show here.</p>
      </div>
    );
  }
  const address = w.address;
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-2xl border border-border bg-card p-4 text-foreground" aria-label="QR code of your wallet address" role="img">
        <QRCodeSVG value={address} size={168} bgColor="transparent" fgColor="currentColor" level="M" marginSize={0} />
      </div>
      <div className="w-full text-center">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Your wallet address</div>
        <div className="mt-1.5 flex justify-center lg:hidden"><Address value={address} head={10} tail={8} className="text-sm" /></div>
        <code className="num mt-2 hidden break-all text-[13px] leading-relaxed text-foreground/90 lg:block">{address}</code>
      </div>
      <Button size="lg" className="min-h-11 w-full text-[15px]" onClick={() => void w.copy()} aria-live="polite">
        {w.copied ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
        {w.copied ? "Copied" : "Copy address"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        USDC and XLM on Stellar testnet. This is a <Term detail="Smart account contract (C…) with a passkey signer. Classic G-only senders such as the anchor use a landing account, which the lira deposit handles for you.">contract address</Term>.
      </p>
    </div>
  );
}
