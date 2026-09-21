"use client";

/**
 * "2 CHANGES · ONE PASSKEY CONFIRMATION TO SAVE", Discard and Save rules. Pinned to the bottom on phones. Before the
 * first save it turns into one sentence about the key Koul gets, with Give access; after a failure it keeps the
 * reason on screen until the next attempt.
 */
import { Label, PillButton, Tile } from "@/components/signal";

export interface AccessAsk {
  /** The wallet has no XOXNO position yet: the first save opens one with 1 USDC, one more passkey. */
  needsPosition: boolean;
  days: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaveBar({ changes, confirmations, blocker, error, ask, busy, busyLabel, onDiscard, onSave }: { changes: number; confirmations: number; blocker: string | null; error: string | null; ask: AccessAsk | null; busy: boolean; busyLabel: string | null; onDiscard: () => void; onSave: () => void }) {
  const words = ["", "one", "two", "three"][confirmations] ?? String(confirmations);
  const line = blocker ?? error ?? `${changes} ${changes === 1 ? "change" : "changes"} · ${words} passkey ${confirmations === 1 ? "confirmation" : "confirmations"} to save`;
  if (ask && !busy) {
    return (
      <div className="sticky bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:static">
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
      </div>
    );
  }
  return (
    <div className="sticky bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:static">
      <Tile className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <Label tone={blocker || error ? "danger" : "muted"} className="text-center md:text-left" role={error ? "alert" : undefined}>{line}</Label>
        <div className="flex flex-col-reverse gap-3 md:flex-row">
          <PillButton variant="outline" size="lg" onClick={onDiscard} disabled={busy}>Discard</PillButton>
          <PillButton size="lg" onClick={onSave} disabled={busy || !!blocker || changes === 0} aria-busy={busy}>{busy ? busyLabel ?? "Saving" : error ? "Try again" : "Save rules"}</PillButton>
        </div>
      </Tile>
    </div>
  );
}
