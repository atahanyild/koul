"use client";

/** The progress of a bank transfer: four named dots on desktop, a four-segment bar and "STEP 2 OF 4 · SEND" on phones. */
import { motion } from "motion/react";
import { Label } from "@/components/signal";
import { tween } from "@/lib/motion";
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
              <motion.span aria-hidden layout className={cn("inline-block size-3 rounded-full", done ? "bg-accent-text" : now ? (failed ? "border-2 border-danger" : "border-2 border-accent-text") : "border-2 border-dim")} initial={false} animate={{ scale: done ? [1, 1.3, 1] : 1 }} transition={tween()} />
              <Label tone={done || now ? "text" : "muted"}>{l}</Label>
            </li>
          );
        })}
      </ol>
      <div className="md:hidden">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-hidden>
          {labels.map((l, i) => (
            <span key={l} className="relative h-1.5 overflow-hidden rounded-full bg-surface-2">
              {(i < active || (i === current && active < labels.length)) && (
                <motion.span className={cn("absolute inset-0 origin-left rounded-full", i < active ? "bg-accent-text" : failed ? "bg-danger" : "bg-accent-text/50")} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={tween()} />
              )}
            </span>
          ))}
        </div>
        <Label className="mt-3 block">{active >= labels.length ? "Done" : `Step ${current + 1} of ${labels.length} · ${labels[current]}`}</Label>
      </div>
    </div>
  );
}
