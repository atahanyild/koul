"use client";

/**
 * "2 CHANGES · ONE PASSKEY CONFIRMATION TO SAVE", Discard and Save rules. Pinned to the bottom on phones. Before the
 * first save it turns into one sentence about the key Koul gets, with the steps ahead and Give access; while the
 * passkeys run it shows those steps with what each one is waiting on; after a failure it keeps the failed step and
 * its reason on screen until the next attempt; after a success it turns accent with a drawn check for a moment.
 */
import { AnimatePresence, motion } from "motion/react";
import { Label, PillButton, Tile } from "@/components/signal";
import { Steps } from "@/components/flows/steps";
import { SPRING_SOFT, tween } from "@/lib/motion";
import { activeIndex, type SaveStep } from "@/lib/model/save-steps";

export interface AccessAsk {
  /** The wallet has no XOXNO position yet: the first save opens one with 1 USDC, one more passkey. */
  needsPosition: boolean;
  days: number;
  /** The passkey steps this save will run, in order. */
  steps: SaveStep[];
  onConfirm: () => void;
  onCancel: () => void;
}

const slide = { initial: { y: 24, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: 24, opacity: 0 }, transition: SPRING_SOFT };
const swap = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: tween() };

/** A check mark drawn in about 400 ms. */
function Check() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <motion.path d="M4 12.5l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }} />
    </svg>
  );
}

/** The steps strip with the line for the step in progress, or the failed one's reason. */
function Progress({ steps }: { steps: SaveStep[] }) {
  const failed = steps.find((s) => s.state === "failed") ?? null;
  const active = steps.find((s) => s.state === "active") ?? null;
  const line = failed ? `${failed.label} failed: ${failed.detail ?? "the transaction did not go through"}` : active ? `${active.label} · ${active.detail ?? "Working"}` : null;
  return (
    <div className="grid gap-3" aria-live="polite">
      <Steps labels={steps.map((s) => s.label)} active={activeIndex(steps)} failed={failed !== null} />
      {line && <Label tone={failed ? "danger" : "text"} className="hidden md:block" role={failed ? "alert" : undefined}>{line}</Label>}
      {failed && <Label tone="danger" className="md:hidden" role="alert">{line}</Label>}
    </div>
  );
}

export function SaveBar({ changes, confirmations, blocker, error, ask, saved, busy, busyLabel, progress, onDiscard, onSave }: {
  changes: number;
  confirmations: number;
  blocker: string | null;
  error: string | null;
  ask: AccessAsk | null;
  /** The save just landed: the bar turns accent for a moment before it leaves. */
  saved?: boolean;
  busy: boolean;
  busyLabel: string | null;
  /** The steps of the save in progress, or of the one that just failed; null when nothing has started. */
  progress: SaveStep[] | null;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const words = ["", "one", "two", "three"][confirmations] ?? String(confirmations);
  const line = blocker ?? error ?? `${changes} ${changes === 1 ? "change" : "changes"} · ${words} passkey ${confirmations === 1 ? "confirmation" : "confirmations"} to save`;
  const failed = progress?.some((s) => s.state === "failed") ?? false;
  const complete = progress !== null && progress.every((s) => s.state === "done");
  const showProgress = progress !== null && (busy || failed || complete);
  return (
    <motion.div {...slide} className="sticky bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:static">
      <AnimatePresence mode="wait" initial={false}>
        {saved ? (
          <motion.div key="saved" {...swap}>
            <Tile tone="lime" className="flex items-center justify-center gap-3 p-5" role="status">
              <Check />
              <span className="text-[17px] font-bold">Rules saved</span>
            </Tile>
          </motion.div>
        ) : ask && !busy ? (
          <motion.div key="ask" {...swap}>
            <Tile className="grid gap-5 p-5">
              <p className="text-[15px] text-text md:max-w-[640px]">
                Koul gets a limited key for {ask.days} days that can only run these rules on your XOXNO position, never move USDC anywhere else, and that you can revoke at any time.
                {ask.needsPosition ? " Your first save also opens that position with 1 USDC." : ""} {ask.steps.length === 1 ? "One" : ask.steps.length === 2 ? "Two" : "Three"} passkey {ask.steps.length === 1 ? "confirmation" : "confirmations"}, in this order:
              </p>
              <Steps labels={ask.steps.map((s) => s.label)} active={0} />
              <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                <PillButton variant="outline" size="lg" onClick={ask.onCancel}>Cancel</PillButton>
                <PillButton size="lg" onClick={ask.onConfirm}>Give access</PillButton>
              </div>
            </Tile>
          </motion.div>
        ) : showProgress ? (
          <motion.div key="progress" {...swap}>
            <Tile className="grid gap-4 p-4 md:p-5">
              <Progress steps={progress} />
              {!complete && (
                <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                  <PillButton variant="outline" size="lg" onClick={onDiscard} disabled={busy}>Discard</PillButton>
                  <PillButton size="lg" onClick={onSave} disabled={busy} aria-busy={busy}>{busy ? busyLabel ?? "Saving" : "Try again"}</PillButton>
                </div>
              )}
            </Tile>
          </motion.div>
        ) : (
          <motion.div key="bar" {...swap}>
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
