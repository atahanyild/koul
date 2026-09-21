"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> { value: T; label: React.ReactNode }

/** One switch with two or three options: a dark track, a white pill on the selected one. */
export function Segmented<T extends string>({ options, value, onChange, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid rounded-full bg-surface p-1", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-11 rounded-full px-4 text-[15px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
              on ? "bg-text text-background" : "text-muted hover:text-text",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The small text selector on the chart tile: 7D · 30D · ALL. */
export function TextSegmented<T extends string>({ options, value, onChange, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex items-center gap-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn("label min-h-11 min-w-11 rounded-full px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime", on ? "text-text font-medium" : "text-dim hover:text-muted")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
