"use client";

/**
 * "2 CHANGES · ONE PASSKEY CONFIRMATION TO SAVE", Discard and Save rules. Pinned to the bottom on phones. Before the
 * first save it turns into one sentence about the key Koul gets, with Give access; after a failure it keeps the
 * reason on screen until the next attempt; after a success it turns accent with a drawn check for a moment.
 */
import { AnimatePresence, motion } from "motion/react";
import { Label, PillButton, Tile } from "@/components/signal";
import { SPRING_SOFT, tween } from "@/lib/motion";

export interface AccessAsk {
  /** The wallet has no XOXNO position yet: the first save opens one with 1 USDC, one more passkey. */
  needsPosition: boolean;
  days: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const slide = { initial: { y: 24, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 24, opacity: 0 }, transition: SPRING_SOFT };

/** A check mark drawn in about 400 ms. */
function Check() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <motion.path d="M4 12.5l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }} />
    </svg>
  );
}

export function SaveBar({ changes, confirmations, blocker, error, ask, saved, busy, busyLabel, onDiscard, onSave }: { changes: number; confirmations: number; blocker: string | null; error: string | null; ask: AccessAsk | null; /** The save just landed: the bar turns accent for a moment before it leaves. */ saved?: boolean; busy: boolean; busyLabel: string | null; onDiscard: () => void; onSave: () => void }) {
  const words = ["", "one", "two", "three"][confirmations] ?? String(confirmations);
  const line = blocker ?? error ?? `${changes} ${changes === 1 ? "change" : "changes"} · ${words} passkey ${confirmations === 1 ? "confirmation" : "confirmations"} to save`;
  return (
    <motion.div {...slide} className="sticky bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:static">
      <AnimatePresence mode="wait" initial={false}>
        {saved ? (
          <motion.div key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween()}>
            <Tile tone="lime" className="flex items-center justify-center gap-3 p-5" role="status">
              <Check />
              <span className="text-[17px] font-bold">Rules saved</span>
            </Tile>
          </motion.div>
        ) : ask && !busy ? (
          <motion.div key="ask" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween()}>
            <Tile className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <p className="text-[15px] text-text md:max-w-[640px]">
                Koul gets a limited key for {ask.days} days that can only run these rules on your XOXNO position, never move USDC anywhere else, and that you can revoke at any time.
                {ask.needsPosition ? " Your first save also opens that position with 1 USDC." : ""} {ask.needsPosition ? "Three" : "Two"} passkey confirmations.
              </p>
              <div className="flex flex-col-reverse gap-3 md:flex-row">
                <PillButton variant="outline" size="lg" onClick={ask.onCancel}>Cancel</PillButton>
                <PillButton size="lg" onClick={ask.onConfirm}>Give access</PillButton>
              </div>
            </Tile>
          </motion.div>
        ) : (
          <motion.div key="bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tween()}>
            <Tile className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
              <Label tone={blocker || error ? "danger" : "muted"} className="text-center md:text-left" role={error ? "alert" : undefined}>{line}</Label>
              <div className="flex flex-col-reverse gap-3 md:flex-row">
                <PillButton variant="outline" size="lg" onClick={onDiscard} disabled={busy}>Discard</PillButton>
                <PillButton size="lg" onClick={onSave} disabled={busy || !!blocker || changes === 0} aria-busy={busy}>{busy ? busyLabel ?? "Saving" : error ? "Try again" : "Save rules"}</PillButton>
              </div>
            </Tile>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
