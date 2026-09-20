"use client";

/** A small segmented choice (1 / 7 / 30 days, everything / an amount). Buttons, so Tab and Space just work. */
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
}

export function Segmented<T extends string | number>({ value, options, onChange, label, className, size = "md" }: { value: T; options: SegmentedOption<T>[]; onChange: (v: T) => void; label: string; className?: string; size?: "sm" | "md" }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex w-full rounded-lg bg-surface-2 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              size === "md" ? "min-h-10" : "min-h-8 text-[13px]",
              on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
