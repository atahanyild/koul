"use client";

/**
 * The AI box at the top of the new-autopilot page: a large sentence field, three example chips that fill it, and
 * one button that turns the sentence into rules. It is the first thing on the page whether or not rules exist.
 */
import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/koul/primitives";
import type { ParseSource } from "./parse";

export const MAX_SENTENCE = 2000;

export const EXAMPLES: { label: string; text: string }[] = [
  { label: "Lira shield", text: "Keep my USDC in whichever pool pays more, never let my loan health drop under 1.25, and if the lira goes past 50 pull everything back to my wallet." },
  { label: "Best rate", text: "Move my USDC to whichever pool pays at least half a point more, and wait 12 hours between moves." },
  { label: "Loan guard", text: "If my loan health drops under 1.3, repay from the USDC in my wallet. Once an hour is enough." },
];

const PLACEHOLDER = "For example: keep my USDC where it earns most, but if the lira passes 50 move everything back to my wallet and wait a day.";

export interface SentenceBoxProps {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Which parser answered the last submit, so the box can say so. */
  lastSource: ParseSource | null;
  /** How many rules the last submit produced, or null before any submit. */
  lastCount: number | null;
  className?: string;
}

export function SentenceBox({ value, onChange, onSubmit, busy, lastSource, lastCount, className }: SentenceBoxProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const canSubmit = value.trim().length > 0 && !busy;

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const fill = (text: string) => {
    onChange(text);
    ref.current?.focus();
  };

  return (
    <section aria-labelledby="sentence-title" className={cn("rounded-xl border border-clay/50 bg-card p-4 sm:p-6", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="sentence-title" className="display text-2xl leading-tight">Say what you want, in your words</h2>
          <p className="mt-1 text-sm text-muted-foreground">Koul turns it into rules you can read. Only things the router can check and do; anything else is flagged, never invented.</p>
        </div>
        <span className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-clay-soft text-clay sm:inline-flex" aria-hidden>
          <Sparkles className="size-5" />
        </span>
      </div>

      <label htmlFor="sentence" className="sr-only">What should this autopilot do?</label>
      <textarea
        id="sentence"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_SENTENCE))}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER}
        rows={4}
        maxLength={MAX_SENTENCE}
        disabled={busy}
        aria-busy={busy}
        className="mt-4 min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3.5 py-3 text-base leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-input/30"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Examples">
        <span className="text-xs text-muted-foreground">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => fill(ex.text)}
            disabled={busy}
            className="inline-flex min-h-8 items-center rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {lastCount !== null && lastSource ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              <Pill tone={lastCount > 0 ? "clay" : "warning"}>
                <span className="num">{lastCount}</span> rule{lastCount === 1 ? "" : "s"} written
              </Pill>
              <span>{lastSource === "koul" ? "Written by Koul from your sentence." : "Matched by keywords; Koul's parser is not set up here."}</span>
            </span>
          ) : (
            <>Rules replace anything below. Cmd or Ctrl + Enter also sends.</>
          )}
        </p>
        <Button size="lg" className="min-h-11 px-4 text-[15px] sm:shrink-0" disabled={!canSubmit} onClick={onSubmit}>
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Sparkles data-icon="inline-start" />}
          {busy ? "Writing the rules" : "Turn into rules"}
        </Button>
      </div>
    </section>
  );
}
