"use client";

/** The progress of a bank transfer: four named dots on desktop, a four-segment bar and "STEP 2 OF 4 · SEND" on phones. */
import { Label } from "@/components/signal";
import { cn } from "@/lib/utils";

export function Steps({ labels, active, failed }: { labels: string[]; active: number; failed?: boolean }) {
  const current = Math.min(active, labels.length - 1);
  return (
    <div>
      <ol className="hidden items-center justify-between md:flex" aria-label="Progress">
        {labels.map((l, i) => {
          const done = i < active;
          const now = i === current && active < labels.length;
          return (
            <li key={l} className="flex items-center gap-2">
              <span aria-hidden className={cn("inline-block size-3 rounded-full", done ? "bg-lime" : now ? (failed ? "border-2 border-danger" : "border-2 border-lime") : "border-2 border-dim")} />
              <Label tone={done || now ? "text" : "dim"}>{l}</Label>
            </li>
          );
        })}
      </ol>
      <div className="md:hidden">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-hidden>
          {labels.map((l, i) => <span key={l} className={cn("h-1.5 rounded-full", i < active ? "bg-lime" : i === current && active < labels.length ? (failed ? "bg-danger" : "bg-lime/50") : "bg-surface-2")} />)}
        </div>
        <Label className="mt-3 block">{active >= labels.length ? "Done" : `Step ${current + 1} of ${labels.length} · ${labels[current]}`}</Label>
      </div>
    </div>
  );
}
