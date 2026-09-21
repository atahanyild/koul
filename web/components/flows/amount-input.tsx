"use client";

/** "You send": a large amount with its unit on the right and a lime rule under it. Digits only, one decimal point. */
import * as React from "react";
import { Label } from "@/components/signal";
import { cn } from "@/lib/utils";

export function sanitizeAmount(v: string): string {
  let s = v.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const i = s.indexOf(".");
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s;
}

export const parseAmount = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function AmountInput({ value, onChange, unit, label = "You send", placeholder = "0", autoFocus, trailing, className }: { value: string; onChange: (v: string) => void; unit: string; label?: string; placeholder?: string; autoFocus?: boolean; trailing?: React.ReactNode; className?: string }) {
  const id = React.useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="t-tile-label text-muted">{label}</label>
      <div className="mt-3 flex items-end gap-4 border-b-2 border-lime pb-3">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(sanitizeAmount(e.target.value))}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          size={1}
          className={cn("t-hero num w-0 min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-dim", value.length > 9 ? "text-[32px] md:text-[48px]" : value.length > 6 && "text-[40px] md:text-[64px]")}
        />
        <span className="pb-2 text-[24px] font-extrabold text-dim md:text-[28px]">{unit}</span>
      </div>
      {trailing && <div className="mt-3 flex items-center justify-between">{trailing}</div>}
    </div>
  );
}

export function AmountHint({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
}
