"use client";

/**
 * The large amount input every flow starts with: a unit, a tabular number, quick-pick chips and one line for
 * a hint or an error. The value is the raw string the user typed; parse it with `parseAmount`.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { sanitizeAmount } from "./use-funds";

export interface AmountChip { label: string; value: string }

export function AmountField({ id, label, value, onChange, unit, chips, hint, error, autoFocus, disabled, className }: {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  unit: "TRY" | "USDC" | "XLM";
  chips?: AmountChip[];
  /** Right of the label, e.g. "Available 30.00 USDC" with a Max button. */
  hint?: React.ReactNode;
  error?: string | null;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const errId = `${id}-error`;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className={cn("mt-2 flex items-center gap-2 rounded-xl border border-input bg-card px-4 py-3 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", error && "border-negative/60", disabled && "opacity-60")}>
        {unit === "TRY" && <span className="num select-none text-2xl text-muted-foreground" aria-hidden>₺</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(sanitizeAmount(e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          className="num min-w-0 flex-1 bg-transparent text-[2rem] leading-none text-foreground outline-none placeholder:text-muted-foreground/40"
        />
        {unit !== "TRY" && <span className="select-none text-sm font-medium tracking-wide text-muted-foreground">{unit}</span>}
      </div>
      {chips && chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={disabled}
              aria-pressed={value === c.value}
              onClick={() => onChange(c.value)}
              className="num inline-flex min-h-9 items-center rounded-full border border-border bg-transparent px-3.5 text-[13px] text-foreground/85 transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-saffron/40 aria-pressed:bg-saffron-soft aria-pressed:text-saffron disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {error && <p id={errId} role="alert" className="mt-2 text-xs text-negative">{error}</p>}
    </div>
  );
}
