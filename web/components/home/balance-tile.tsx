"use client";

import { Label, PillButton, Sk, Tile } from "@/components/signal";
import { fmtLira, fmtUsdc } from "@/lib/format";

/** The lime tile: total USDC (wallet plus XOXNO, minus debt), the lira equivalent, Deposit and Withdraw. */
export function BalanceTile({ balance, lira, loading }: { balance: number | null; lira: number | null; loading: boolean }) {
  return (
    <Tile tone="lime" className="flex min-h-[380px] flex-col p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-bold">Balance</span>
        <span className="text-[16px] font-bold">USDC</span>
      </div>
      <div className="mt-auto mb-auto py-8">
        {loading || balance === null ? <Sk className="h-[56px] w-64 rounded-xl bg-on-lime/10 md:h-[92px] md:w-[420px]" /> : <div className="t-hero num">{fmtUsdc(balance)}</div>}
        <div className="mt-3 min-h-5">
          {loading || lira === null ? <Sk className="h-4 w-28 bg-on-lime/10" /> : <Label tone="onLime">{fmtLira(lira)}</Label>}
        </div>
      </div>
      <div className="flex gap-3">
        <PillButton variant="onLime" size="lg" href="/deposit">Deposit</PillButton>
        <PillButton variant="onLimeOutline" size="lg" href="/withdraw">Withdraw</PillButton>
      </div>
    </Tile>
  );
}
