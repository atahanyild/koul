"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** The lime COPY word that becomes COPIED for a moment. A real button with an accessible name. */
export function CopyAction({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable: nothing to do, the value is still on screen.
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${label}: ${value}`}
      aria-live="polite"
      className={cn("label -mr-2 inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-lime transition-[filter,background-color] hover:bg-surface-2 hover:brightness-110 active:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime", className)}
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

/** A key, a mono value and COPY, in a bordered group row. The deposit details use three of these. */
export function CopyRow({ label, value, display, className }: { label: string; value: string; display?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-14 items-center gap-4 px-4 py-3", className)}>
      <span className="label w-24 shrink-0 text-muted">{label}</span>
      <span className="mono num min-w-0 flex-1 truncate">{display ?? value}</span>
      <CopyAction value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}
