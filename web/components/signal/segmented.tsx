"use client";

import * as React from "react";
import { motion } from "motion/react";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> { value: T; label: React.ReactNode }

/** One switch with two or three options: a dark track, a white pill on the selected one. */
export function Segmented<T extends string>({ options, value, onChange, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; label: string; className?: string }) {
  const id = React.useId();
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
              "relative h-11 rounded-full px-4 text-[15px] font-bold transition-colors duration-[240ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
              on ? "text-background" : "text-muted hover:text-text active:text-text",
            )}
          >
            {on && <motion.span layoutId={`${id}-pill`} transition={SPRING} className="absolute inset-0 rounded-full bg-text" aria-hidden />}
            <span className="relative">{o.label}</span>
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
            className={cn("label min-h-11 min-w-11 rounded-full px-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime", on ? "text-text font-medium" : "text-dim hover:text-muted active:text-text")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
