"use client";

/**
 * The editing state of the Autopilot page: a draft list of rules that starts as a copy of what the router holds,
 * kept in this browser until it is saved or discarded. While a draft exists the page is in EDITING; the live rules
 * keep running until the save lands.
 */
import { useCallback, useMemo } from "react";
import { createLocalStore } from "@/lib/data/store";
import { countChanges, moveItem, moveTo } from "@/lib/model/edit";
import { newId, type Rule } from "@/lib/model/autopilot";

/** `past` holds the lists before each change that can be undone (a drop, a chat edit), newest last. */
interface Draft { rules: Rule[]; open: string | null; past?: Rule[][] }
const UNDO_DEPTH = 10;
const drafts = createLocalStore<Record<string, Draft>>("koul.autopilot.draft", {});

export interface Editor {
  rules: Rule[];
  editing: boolean;
  /** Rule id whose row is open. */
  open: string | null;
  changes: number;
  begin: () => void;
  discard: () => void;
  setOpen: (id: string | null) => void;
  add: (rule: Rule) => void;
  append: (rules: Rule[]) => void;
  update: (id: string, patch: Partial<Rule> | ((r: Rule) => Rule)) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  moveTo: (from: number, to: number) => void;
  /** Replace the whole list as one undoable change (a drop, a sentence that edited a rule). */
  replace: (rules: Rule[], open?: string | null) => void;
  canUndo: boolean;
  undo: () => void;
}

/** The draft with `next` as its list and the current list pushed onto the undo stack. */
function remember(d: Draft, next: Rule[]): Draft {
  return { ...d, rules: next, past: [...(d.past ?? []), d.rules].slice(-UNDO_DEPTH) };
}

export function useEditor(address: string | null, saved: Rule[]): Editor {
  const [all, setAll] = drafts.use();
  const key = address ?? "";
  const draft = key ? all[key] ?? null : null;
  const rules = draft ? draft.rules : saved;
  const set = useCallback((f: (d: Draft) => Draft) => {
    setAll((prev) => ({ ...prev, [key]: f(prev[key] ?? { rules: saved.map((r) => ({ ...r })), open: null }) }));
  }, [key, saved, setAll]);
  const clearDraft = useCallback(() => setAll((prev) => { const next = { ...prev }; delete next[key]; return next; }), [key, setAll]);

  return useMemo<Editor>(() => ({
    rules,
    editing: draft !== null,
    open: draft?.open ?? null,
    changes: draft ? countChanges(saved, draft.rules) : 0,
    begin: () => set((d) => d),
    discard: clearDraft,
    setOpen: (id) => set((d) => ({ ...d, open: id })),
    add: (rule) => set((d) => ({ rules: [...d.rules, rule], open: rule.id })),
    append: (added) => set((d) => ({ rules: [...d.rules, ...added.map((r) => ({ ...r, id: newId() }))], open: added.length === 1 ? null : null })),
    update: (id, patch) => set((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? (typeof patch === "function" ? patch(r) : { ...r, ...patch }) : r)) })),
    remove: (id) => set((d) => ({ rules: d.rules.filter((r) => r.id !== id), open: d.open === id ? null : d.open })),
    toggle: (id) => set((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),
    move: (id, dir) => set((d) => { const i = d.rules.findIndex((r) => r.id === id); return i < 0 ? d : remember(d, moveItem(d.rules, i, dir)); }),
    moveTo: (from, to) => set((d) => (from === to ? d : remember(d, moveTo(d.rules, from, to)))),
    replace: (next, open) => set((d) => ({ ...remember(d, next), open: open === undefined ? d.open : open })),
    canUndo: (draft?.past?.length ?? 0) > 0,
    undo: () => set((d) => { const past = d.past ?? []; const prev = past[past.length - 1]; return prev ? { ...d, rules: prev, past: past.slice(0, -1) } : d; }),
  }), [rules, draft, saved, set, clearDraft]);
}
