"use client";

/** "2 CHANGES · ONE PASSKEY CONFIRMATION TO SAVE", Discard and Save rules. Pinned to the bottom on phones. */
import { Label, PillButton, Tile } from "@/components/signal";

export function SaveBar({ changes, confirmations, blocker, busy, busyLabel, onDiscard, onSave }: { changes: number; confirmations: number; blocker: string | null; busy: boolean; busyLabel: string | null; onDiscard: () => void; onSave: () => void }) {
  const words = ["", "one", "two", "three"][confirmations] ?? String(confirmations);
  const line = blocker ?? `${changes} ${changes === 1 ? "change" : "changes"} · ${words} passkey ${confirmations === 1 ? "confirmation" : "confirmations"} to save`;
  return (
    <div className="sticky bottom-[max(16px,env(safe-area-inset-bottom))] z-30 md:static">
      <Tile className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <Label tone={blocker ? "danger" : "muted"} className="text-center md:text-left">{line}</Label>
        <div className="flex flex-col-reverse gap-3 md:flex-row">
          <PillButton variant="outline" size="lg" onClick={onDiscard} disabled={busy}>Discard</PillButton>
          <PillButton size="lg" onClick={onSave} disabled={busy || !!blocker || changes === 0} aria-busy={busy}>{busy ? busyLabel ?? "Saving" : "Save rules"}</PillButton>
        </div>
      </Tile>
    </div>
  );
}
