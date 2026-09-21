"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "surface" | "surface2" | "lime" | "outline" | "onLime";

const tones: Record<ChipTone, string> = {
  surface: "bg-surface text-text",
  surface2: "bg-surface-2 text-text",
  lime: "bg-lime text-on-lime",
  outline: "border border-line text-text",
  /** A suggestion chip on the lime composer: ink outline on lime. */
  onLime: "border border-on-lime text-on-lime hover:bg-on-lime/10 active:bg-on-lime/20",
};

/** A small round chip. As a button it keeps the 44 px target through its height. */
export function Chip({ tone = "surface2", mono = false, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ChipTone; mono?: boolean }) {
  const interactive = Boolean(rest.onClick) || rest.type === "submit";
  const cls = cn(
    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 whitespace-nowrap",
    mono ? "label" : "text-[14px] font-bold",
    tones[tone],
    interactive && "transition-[filter,opacity,background-color] hover:brightness-110 active:brightness-125 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
    className,
  );
  if (interactive) {
    return (
      <button type={rest.type ?? "button"} className={cls} {...rest}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}

/** Filter pills: the selected one is white on black. */
export function FilterChip({ selected, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 items-center rounded-full px-5 text-[15px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime",
        selected ? "bg-text text-background" : "bg-surface-2 text-muted hover:text-text active:brightness-125",
        className,
      )}
      {...rest}
    />
  );
}
