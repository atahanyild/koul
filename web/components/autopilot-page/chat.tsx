"use client";

/**
 * "Tell Koul what to do": a short conversation that ends in a draft rule the user accepts. One component for the
 * live page (the large lime tile that becomes a dark panel while Koul works) and the editing page (the slim
 * composer, whose answers change the draft rules directly). Every transition is the reducer's; this file renders
 * a state, sends requests, and keeps the focus in the input.
 */
import * as React from "react";
import { ArrowRight, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DUR, rise, tween } from "@/lib/motion";
import { Chip, IconButton, Label, PillButton } from "@/components/signal";
import { RuleLine } from "@/components/rules/rule-line";
import { askKoul } from "@/lib/chat/client";
import { canSend, chatReducer, initialChatState, TIMEOUT_MS, type ChatDraft, type ChatMessage, type ChatReply } from "@/lib/chat/reducer";
import type { LiveContext } from "@/lib/chat/schema";
import type { Rule } from "@/lib/model/autopilot";
import { cooldownShort } from "@/lib/model/labels";
import { cn } from "@/lib/utils";

export const SUGGESTIONS: { label: string; text: string }[] = [
  { label: "Exit if the lira drops", text: "Exit if the lira drops" },
  { label: "Chase the best rate", text: "Keep my USDC in whichever hub pays more" },
  { label: "Repay before liquidation", text: "Repay my debt from my wallet if my health drops under 1.25" },
  { label: "Put idle USDC to work", text: "Whenever I have more than 100 USDC sitting in my wallet, supply it to the hub that pays most" },
];

const PLACEHOLDER = "Pull everything back to my wallet if USD/TRY passes 50";

export interface ChatProps {
  mode: "live" | "editing";
  /** The list a draft is built on: the saved rules on the live page, the draft on the editing page. */
  rules: Rule[];
  live: LiveContext;
  /** The user accepted a draft on the live page: the page enters editing with this list. */
  onAccept: (draft: ChatDraft, how: "add" | "adjust") => void;
  /** Editing mode: a reply changed the list; the page applies it and returns the note to show. */
  onEdit?: (draft: ChatDraft) => string | null;
  chips?: number;
}

/** Three dots in sequence, the sign that Koul is working. */
function Dots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-text animate-blink" style={{ animationDelay: `${i * 0.2}s`, animationDuration: "1.2s" }} />)}
    </span>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return <motion.div layout {...rise(8)} className="ml-auto max-w-[85%] rounded-2xl bg-surface-2 px-4 py-3 text-[15px] font-bold text-text md:text-[16px]">{m.text}</motion.div>;
  }
  return (
    <motion.div layout {...rise(8)} className="grid gap-1.5">
      <Label tone="lime">Koul</Label>
      <p className="text-[15px] text-text md:text-[16px]">{m.text}</p>
    </motion.div>
  );
}

/** The proposed rule. Its layout id is the one the row in the editor will carry, so accepting makes it travel there. */
function DraftRow({ draft }: { draft: ChatDraft }) {
  const rule = draft.rules[draft.position - 1];
  if (!rule) return null;
  return (
    <motion.div layout layoutId={`rule-${rule.id}`} {...rise(8)} className="rounded-[var(--radius-group)] bg-surface-2 px-4 py-1">
      <RuleLine index={draft.position} rule={rule} hideNumber nowOverride={`WAIT ${cooldownShort(rule.cooldownSec).toUpperCase()}`} trailing={<span className="text-accent-text">DRAFT · RULE {draft.position}</span>} className="py-3" />
    </motion.div>
  );
}

export function Chat({ mode, rules, live, onAccept, onEdit, chips = SUGGESTIONS.length }: ChatProps) {
  const [s, dispatch] = React.useReducer(chatReducer, initialChatState);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = React.useRef({ rules, live, mode, onEdit });
  React.useEffect(() => { latest.current = { rules, live, mode, onEdit }; }, [rules, live, mode, onEdit]);

  // After every transition the focus comes back to the input.
  React.useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, [s.phase]);
  // Leaving the page drops the conversation and any request in flight.
  React.useEffect(() => () => { abortRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const send = React.useCallback((text?: string) => {
    const t = (text ?? s.input).trim();
    if (!canSend(s, t)) return;
    const next = chatReducer(s, { type: "send", text: t });
    dispatch({ type: "send", text: t });
    const id = next.requestId;
    const ac = new AbortController();
    abortRef.current = ac;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { ac.abort(); dispatch({ type: "timeout", id }); }, TIMEOUT_MS);
    const { rules: base, live: readings, mode: m, onEdit: edit } = latest.current;
    askKoul({ messages: next.messages, rules: base, mode: m, live: readings }, ac.signal)
      .then((reply: ChatReply) => {
        if (m === "editing" && edit && reply.kind === "draft" && reply.rules && reply.position !== undefined) {
          // Editing: the answer changes the draft rules straight away; the conversation ends with a note.
          const note = edit({ rules: reply.rules, position: reply.position });
          dispatch({ type: "reply", id, reply });
          dispatch({ type: "accept", note: note ? `${note} · You said: ${next.lastSent}` : null });
          return;
        }
        dispatch({ type: "reply", id, reply });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        dispatch({ type: "fail", id, message: err instanceof Error ? err.message : "Koul could not answer" });
      })
      .finally(() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } });
  }, [s]);

  const stop = () => { abortRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); dispatch({ type: "abort" }); };
  const retry = () => { const next = chatReducer(s, { type: "retry" }); if (next !== s && s.lastSent) { dispatch({ type: "discard" }); queueMicrotask(() => send(s.lastSent!)); } };
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const sending = s.phase === "sending";
  const placeholder = s.phase === "draft" ? "Reply to change it, e.g. make it 51" : s.phase === "clarify" ? "Or type a level" : sending ? "Koul is working…" : mode === "editing" ? "A new rule, or a change" : PLACEHOLDER;

  const input = (variant: "large" | "slim" | "panel") => (
    <div className={cn("flex items-center rounded-full pl-6 pr-2", variant === "large" ? "h-16 bg-surface" : variant === "panel" ? "h-14 bg-background" : "h-14 bg-background")}>
      {variant === "slim" && <Label tone="lime" className="mr-3 shrink-0">Tell Koul</Label>}
      <textarea
        ref={inputRef}
        rows={1}
        value={s.input}
        onChange={(e) => dispatch({ type: "input", text: e.target.value })}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label="Tell Koul what to do"
        disabled={sending}
        // One line like an input (Shift+Enter still breaks a line); a long sentence scrolls sideways instead of wrapping.
        className="no-scrollbar min-w-0 flex-1 resize-none overflow-x-auto overflow-y-hidden whitespace-pre bg-transparent py-2 text-[16px] font-medium leading-6 text-text outline-none placeholder:text-muted disabled:opacity-60 md:text-[17px]"
      />
      {sending ? (
        <IconButton type="button" variant="white" size="md" aria-label="Stop" onClick={stop} className="size-12"><Square className="size-4 fill-current" /></IconButton>
      ) : (
        <IconButton type="button" variant="lime" size="md" aria-label="Send" onClick={() => send()} disabled={!canSend(s)} className={variant === "large" ? "size-12" : ""}><ArrowRight className="size-5" /></IconButton>
      )}
    </div>
  );

  // Idle: the composer alone. Large and lime on the live page, slim while editing.
  if (s.phase === "idle") {
    if (mode === "editing") {
      return (
        <div className="grid gap-2">
          <div className="rounded-full border-[3px] border-accent-text bg-background p-1">{input("slim")}</div>
          {s.note && <Label className="px-4"><span className="text-accent-text">Koul</span> · {s.note}</Label>}
        </div>
      );
    }
    return (
      <motion.div layout layoutId="koul-composer" transition={tween(DUR.slow)} className="rounded-[var(--radius-tile)] bg-lime p-6 text-on-lime md:p-8">
        <h2 className="text-[28px] font-extrabold tracking-[-0.03em] md:text-[32px]">Tell Koul what to do</h2>
        <div className="mt-5">{input("large")}</div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {SUGGESTIONS.slice(0, chips).map((c) => <Chip key={c.label} tone="onLime" onClick={() => send(c.text)}>{c.label}</Chip>)}
        </div>
        {s.note && <Label tone="onLime" className="mt-3 block">{s.note}</Label>}
      </motion.div>
    );
  }

  // Working, asking, proposing, declining or failing: the dark panel with the conversation.
  return (
    <motion.div layout layoutId={mode === "editing" ? undefined : "koul-composer"} transition={tween(DUR.slow)} className={cn("rounded-[var(--radius-tile)] border border-accent-text bg-surface p-5 md:p-7", mode === "editing" && "p-4 md:p-5")} role="region" aria-label="Koul">
      <div className="grid gap-4">
        <AnimatePresence initial={false}>
        {s.messages.map((m, i) => <Bubble key={`${i}-${m.role}`} m={m} />)}
        {sending && (
          <motion.div key="working" {...rise(8)} className="grid gap-1.5">
            <Label tone="lime">Koul</Label>
            <div className="flex items-center gap-3 text-[15px] text-muted md:text-[16px]"><Dots /> Working out the {mode === "editing" ? "change" : "rule"}</div>
          </motion.div>
        )}
        </AnimatePresence>
        {s.phase === "clarify" && s.choices.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
            {s.choices.map((c) => <Chip key={c} tone="surface2" mono onClick={() => send(c)}>{c}</Chip>)}
          </div>
        )}
        {s.phase === "draft" && s.draft && (
          <>
            <DraftRow draft={s.draft} />
            <motion.div {...rise(6, DUR.fast)} className="flex flex-wrap gap-2">
              <PillButton size="md" onClick={() => { onAccept(s.draft!, "add"); dispatch({ type: "accept" }); }}>Add to rules</PillButton>
              <PillButton variant="ghost" size="md" onClick={() => { onAccept(s.draft!, "adjust"); dispatch({ type: "accept" }); }}>Adjust</PillButton>
              <PillButton variant="outline" size="md" onClick={() => dispatch({ type: "discard" })}>Discard</PillButton>
            </motion.div>
          </>
        )}
        {s.phase === "error" && (
          <div className="flex flex-wrap items-center justify-between gap-3" role="alert">
            <Label tone="danger">{s.error}</Label>
            <PillButton variant="outline" size="sm" onClick={retry}>Retry</PillButton>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{input("panel")}</div>
          {(s.phase === "unsupported" || s.phase === "clarify") && <PillButton variant="ghost" size="md" onClick={() => dispatch({ type: "discard" })}>Discard</PillButton>}
        </div>
      </div>
    </motion.div>
  );
}
