"use client";

/** Deposit with crypto: the wallet's contract address as a QR and a line to copy. Only USDC on Stellar lands here. */
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { CopyRow, Label, PillButton, Sk, Tile } from "@/components/signal";
import { useWallet } from "@/hooks/use-wallet";
import { FlowFrame, type Method } from "./flow-frame";

export function DepositCrypto({ method, onMethod }: { method: Method; onMethod: (m: Method) => void }) {
  const router = useRouter();
  const w = useWallet();
  const address = w.address ?? "";
  return (
    <FlowFrame title="Deposit" method={method} onMethod={onMethod} action={<PillButton variant="outline" size="lg" full className="md:hidden" onClick={() => router.push("/")}>Done</PillButton>}>
      <Tile className="grid justify-items-center gap-5">
        <div className="rounded-[var(--radius-group)] border border-line bg-paper p-4 text-ink">
          {address ? <QRCodeSVG value={address} size={168} bgColor="transparent" fgColor="currentColor" level="M" /> : <Sk className="size-[168px]" />}
        </div>
        <Label tone="lime">Only USDC on Stellar</Label>
        <div className="w-full rounded-[var(--radius-group)] border border-line">
          {address ? <CopyRow label="Address" value={address} display={`${address.slice(0, 8)}…${address.slice(-8)}`} /> : <div className="flex min-h-14 items-center px-4"><Sk className="h-4 w-56" /></div>}
        </div>
        <p className="text-center text-[15px] text-muted">A contract address. Send from a wallet that supports Soroban addresses; exchanges usually cannot.</p>
      </Tile>
    </FlowFrame>
  );
}
