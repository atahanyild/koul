"use client";

/**
 * "Tell Koul what to do": one sentence in, rules out through the server route. Large on the live and empty pages,
 * slim while editing. The suggestion chips are sentences the router can act on.
 */
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Chip, IconButton, Label } from "@/components/signal";
import { cn } from "@/lib/utils";

export const SUGGESTIONS: { label: string; text: string }[] = [
  { label: "Exit if the lira drops", text: "Pull everything back to my wallet if USD/TRY passes 50" },
  { label: "Chase the best rate", text: "Keep my USDC in whichever hub pays more" },
  { label: "Repay before liquidation", text: "Repay my debt from my wallet if my health drops under 1.25" },
  { label: "Put idle USDC to work", text: "Whenever I have more than 100 USDC sitting in my wallet, supply it to the hub that pays most" },
];

const PLACEHOLDER = "Pull everything back to my wallet if USD/TRY passes 50";

export function Composer({ variant, busy, error, onSubmit, chips = SUGGESTIONS.length }: { variant: "large" | "slim"; busy: boolean; error: string | null; onSubmit: (text: string) => void; chips?: number }) {
  const [text, setText] = React.useState("");
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    onSubmit(t);
    setText("");
  };
  const input = (
    <div className={cn("flex items-center rounded-full bg-background pl-6 pr-2", variant === "large" ? "h-16" : "h-14")}>
      {variant === "slim" && <Label tone="lime" className="mr-3 shrink-0">Tell Koul</Label>}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={variant === "slim" ? "Tell Koul a new rule" : PLACEHOLDER}
        aria-label="Tell Koul what to do"
        disabled={busy}
        className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-text outline-none placeholder:text-dim disabled:opacity-60 md:text-[17px]"
      />
      <IconButton type="submit" variant="lime" size="md" aria-label="Send" disabled={busy || !text.trim()} aria-busy={busy} className={variant === "large" ? "size-12" : ""}>
        <ArrowRight className={cn("size-5", busy && "animate-blink")} />
      </IconButton>
    </div>
  );
  if (variant === "slim") {
    return (
      <form onSubmit={submit} className="rounded-full border-[3px] border-lime bg-background p-1">
        {input}
        {(busy || error) && <div className="px-6 pb-3 pt-2"><Label tone={error ? "danger" : "muted"}>{error ?? "Reading your sentence"}</Label></div>}
      </form>
    );
  }
  return (
    <form onSubmit={submit} className="rounded-[var(--radius-tile)] bg-lime p-6 text-on-lime md:p-8">
      <h2 className="text-[28px] font-extrabold tracking-[-0.03em] md:text-[32px]">Tell Koul what to do</h2>
      <div className="mt-5">{input}</div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        {SUGGESTIONS.slice(0, chips).map((s) => (
          <Chip key={s.label} tone="onLime" onClick={() => { setText(s.text); onSubmit(s.text); }} disabled={busy}>{s.label}</Chip>
        ))}
      </div>
      <div className="mt-3 min-h-5" role="status" aria-live="polite">
        {busy && <Label tone="onLime">Reading your sentence</Label>}
        {error && !busy && <Label tone="onLime">{error}</Label>}
      </div>
    </form>
  );
}
