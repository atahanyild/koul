"use client";

import { Label, PillButton, Tile } from "@/components/signal";
import { useCountUp } from "@/lib/count-up";
import { fmtLira, fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The lime tile: total USDC (wallet plus XOXNO, minus debt), the lira equivalent, Deposit and Withdraw. While
 * loading the layout stays exactly as it will be, with `0,000.00` and `₺00,000.00` in ink at 22% pulsing slowly;
 * the real figures then count up over 700 ms in tabular digits so nothing shifts.
 */
export function BalanceTile({ balance, lira, loading }: { balance: number | null; lira: number | null; loading: boolean }) {
  const canWithdraw = (balance ?? 0) > 0;
  const shownBalance = useCountUp(loading ? null : balance);
  const shownLira = useCountUp(loading || lira === null ? null : lira);
  const balanceText = shownBalance === null ? "0,000.00" : fmtUsdc(shownBalance);
  const long = (shownBalance === null ? fmtUsdc(balance ?? 0) : balanceText).length > 9;
  return (
    <Tile tone="lime" className="flex min-h-[380px] flex-col p-6 md:p-8">
      <div className="flex items-center justify-between">
        <span className="text-[16px] font-bold">Balance</span>
        <span className="text-[16px] font-bold">USDC</span>
      </div>
      <div className="mt-auto mb-auto py-8">
        <div
          className={cn("t-hero num min-w-0 truncate", long && "text-[40px] md:text-[72px]", shownBalance === null && "animate-pulse-slow text-on-lime")}
          title={long && shownBalance !== null ? balanceText : undefined}
          aria-live="polite"
          aria-label={shownBalance === null ? "Balance loading" : `${fmtUsdc(balance ?? 0)} USDC`}
        >
          {balanceText}
        </div>
        <div className="mt-3 min-h-5">
          {shownLira === null ? (
            <Label tone="onLime" className={cn(loading || lira === null ? "animate-pulse-slow" : "")} aria-hidden>{loading || lira === null ? "₺00,000.00" : ""}</Label>
          ) : (
            <Label tone="onLime">{fmtLira(shownLira)}</Label>
          )}
        </div>
      </div>
      <div className="flex gap-3">
        <PillButton variant="onLime" size="lg" href="/deposit">Deposit</PillButton>
        <PillButton variant="onLimeOutline" size="lg" href="/withdraw" disabled={!canWithdraw}>Withdraw</PillButton>
      </div>
    </Tile>
  );
}
