"use client";

/**
 * The library: rule sets kept in this browser under a name. "Use" loads one into the editor as the draft, "Link"
 * copies a share link that opens the Autopilot page with the set as a draft, "Remove" forgets it. Saving into the
 * library is one name field, inline, from the running tile or the editing header.
 */
import * as React from "react";
import { toast } from "sonner";
import { Label, PillButton, Tile } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import { addToLibrary, library, MAX_NAME, shareLink, type LibraryEntry } from "@/lib/model/library";
import type { Rule } from "@/lib/model/autopilot";
import { whenLabel } from "@/lib/model/labels";

export function useLibrary() {
  const [entries, setEntries] = library.use();
  const save = React.useCallback((name: string, rules: Rule[]): LibraryEntry => {
    let saved: LibraryEntry | null = null;
    setEntries((prev) => { const r = addToLibrary(prev, name, rules); saved = r.entry; return r.entries; });
    return saved!;
  }, [setEntries]);
  const remove = React.useCallback((id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)), [setEntries]);
  return { entries, save, remove };
}

/** Copy a share link for these rules; says so in a toast. */
export async function copyShareLink(rules: Rule[], name?: string): Promise<void> {
  const url = shareLink(window.location.origin, rules, name);
  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied", { description: "Anyone who opens it gets these rules as a draft on their own wallet." });
  } catch {
    toast.error("Could not copy", { description: url });
  }
}

/** One name field and Save. */
export function SaveToLibrary({ rules, defaultName, onDone, onCancel }: { rules: Rule[]; defaultName: string; onDone: (entry: LibraryEntry) => void; onCancel: () => void }) {
  const lib = useLibrary();
  const [name, setName] = React.useState(defaultName);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const entry = lib.save(name, rules);
    toast("Saved to your library", { description: `${entry.name} · ${rules.length} ${rules.length === 1 ? "rule" : "rules"}` });
    onDone(entry);
  };
  return (
    <Tile tone="outlined" className="p-5">
      <form onSubmit={submit} className="flex flex-col gap-3 md:flex-row md:items-center">
        <label htmlFor="library-name" className="label shrink-0 text-muted">Save as</label>
        <input
          id="library-name"
          ref={ref}
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lira shield"
          className="h-12 min-w-0 flex-1 rounded-full bg-surface-2 px-5 text-[16px] font-bold text-text placeholder:font-normal placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
        />
        <div className="flex gap-2">
          <PillButton variant="outline" size="md" onClick={onCancel}>Cancel</PillButton>
          <PillButton size="md" type="submit">Save</PillButton>
        </div>
      </form>
    </Tile>
  );
}

export function Library({ onUse, now }: { onUse: (entry: LibraryEntry) => void; now: number }) {
  const lib = useLibrary();
  if (lib.entries.length === 0) return null;
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4 px-2">
        <h2 className="text-[22px] font-bold">Your library</h2>
        <Label className="hidden md:inline">Kept in this browser · Use replaces the draft</Label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-5">
        {lib.entries.map((e) => (
          <Tile key={e.id} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 truncate text-[20px] font-bold">{e.name}</div>
              <Label>{e.rules.length} {e.rules.length === 1 ? "rule" : "rules"} · {whenLabel(e.savedAt, now)}</Label>
            </div>
            <div className="divide-y divide-line">
              {e.rules.slice(0, 3).map((r, i) => <RuleLine key={r.id} index={i + 1} rule={r} dimmed={!r.enabled} className="py-3" />)}
              {e.rules.length > 3 && <Label className="block pt-3">+{e.rules.length - 3} more</Label>}
            </div>
            <div className="mt-auto flex flex-wrap gap-2">
              <PillButton size="md" onClick={() => onUse(e)}>Use</PillButton>
              <PillButton variant="outline" size="md" onClick={() => void copyShareLink(e.rules, e.name)}>Link</PillButton>
              <PillButton variant="ghost" size="md" onClick={() => { lib.remove(e.id); toast("Removed from your library", { description: e.name }); }}>Remove</PillButton>
            </div>
          </Tile>
        ))}
      </div>
    </div>
  );
}
