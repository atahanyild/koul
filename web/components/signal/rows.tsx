import * as React from "react";
import { cn } from "@/lib/utils";

/** A list inside a tile: rows separated by a hairline, no borders around. */
export function RowList({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("divide-y divide-line", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * One row: a bold title with an optional mono line under it on the left, a mono value on the right.
 * Used by Positions, Assets, Activity and the small Activity tile on Home.
 */
export function Row({ title, sub, value, trailing, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { title: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className={cn("flex min-h-[60px] items-center gap-4 py-3", className)} {...rest}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-bold">{title}</div>
        {sub && <div className="label mt-1 text-muted">{sub}</div>}
      </div>
      {value !== undefined && <div className="mono num shrink-0 text-right text-[15px]">{value}</div>}
      {trailing}
    </div>
  );
}

/** A mono key and a mono value on one line, for quotes and details: YOU GET · ≈ 102.40 USDC. */
export function KeyValue({ label, value, tone = "text", className }: { label: React.ReactNode; value: React.ReactNode; tone?: "text" | "lime" | "muted" | "dim"; className?: string }) {
  const t = { text: "text-text", lime: "text-lime", muted: "text-muted", dim: "text-dim" }[tone];
  return (
    <div className={cn("flex min-h-11 items-center justify-between gap-4 py-2", className)}>
      <span className="label shrink-0 text-muted">{label}</span>
      <span className={cn("mono num min-w-0 break-words text-right", t)}>{value}</span>
    </div>
  );
}
