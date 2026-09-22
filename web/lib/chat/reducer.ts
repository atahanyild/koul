/**
 * The Autopilot chat as one state machine. Every transition is here and nowhere else, so the component only
 * renders a state and dispatches. `idle → sending → draft | clarify | unsupported | error → idle`.
 *
 * - `send` is ignored while a request is out, so a second click cannot send twice.
 * - Every request carries an id; a reply, failure or timeout for an old id is ignored.
 * - `abort` (the Stop button) returns to idle and puts the sentence back in the input.
 * - `accept` ends a draft (the page takes the rules) and may leave a one-line note under the composer.
 * - `discard` clears the conversation.
 */
import type { Rule } from "@/lib/model/autopilot";

export type ChatPhase = "idle" | "sending" | "clarify" | "draft" | "unsupported" | "error";

export interface ChatMessage {
  role: "user" | "koul";
  text: string;
  /** A draft the assistant proposed with this message: the whole list, and where the new or changed rule sits. */
  rules?: Rule[];
  position?: number;
  /** A rule the assistant is asking one detail about, kept so the answer can complete it. */
  pending?: Rule;
}

export interface ChatDraft { rules: Rule[]; position: number }

export interface ChatReply {
  kind: "draft" | "clarify" | "unsupported";
  message: string;
  rules?: Rule[];
  position?: number;
  choices?: string[];
  pending?: Rule;
}

export interface ChatState {
  phase: ChatPhase;
  input: string;
  messages: ChatMessage[];
  choices: string[];
  draft: ChatDraft | null;
  error: string | null;
  /** The text of the last request, so Retry and Stop can put it back. */
  lastSent: string | null;
  /** A short confirmation under the composer after a change was applied in editing mode. */
  note: string | null;
  /** Increments per request; replies for older ids are dropped. */
  requestId: number;
}

export type ChatAction =
  | { type: "input"; text: string }
  | { type: "send"; text?: string }
  | { type: "reply"; id: number; reply: ChatReply }
  | { type: "fail"; id: number; message: string }
  | { type: "timeout"; id: number }
  | { type: "abort" }
  | { type: "retry" }
  | { type: "discard" }
  | { type: "accept"; note?: string | null }
  | { type: "note"; note: string | null };

export const TIMEOUT_MS = 20_000;

export const initialChatState: ChatState = { phase: "idle", input: "", messages: [], choices: [], draft: null, error: null, lastSent: null, note: null, requestId: 0 };

/** What the user can send right now: something typed, and no request in flight. */
export const canSend = (s: ChatState, text = s.input): boolean => s.phase !== "sending" && text.trim().length > 0;

export function chatReducer(s: ChatState, a: ChatAction): ChatState {
  switch (a.type) {
    case "input":
      return { ...s, input: a.text };
    case "send": {
      const text = (a.text ?? s.input).trim();
      if (!canSend(s, text)) return s;
      // A user turn always starts from the conversation so far; an unsupported or errored turn is replaced.
      const base = s.phase === "unsupported" || s.phase === "error" ? s.messages.filter((m, i) => !(i === s.messages.length - 1 && m.role === "user")) : s.messages;
      return { ...s, phase: "sending", input: "", messages: [...base, { role: "user", text }], choices: [], error: null, note: null, lastSent: text, requestId: s.requestId + 1 };
    }
    case "reply": {
      if (a.id !== s.requestId || s.phase !== "sending") return s;
      const r = a.reply;
      if (r.kind === "draft" && r.rules && r.position !== undefined) {
        return { ...s, phase: "draft", messages: [...s.messages, { role: "koul", text: r.message, rules: r.rules, position: r.position }], draft: { rules: r.rules, position: r.position }, choices: [], error: null };
      }
      if (r.kind === "clarify") {
        return { ...s, phase: "clarify", messages: [...s.messages, { role: "koul", text: r.message, pending: r.pending }], choices: r.choices ?? [], draft: null, error: null };
      }
      // Unsupported: the sentence stays in the input for the user to change.
      return { ...s, phase: "unsupported", messages: [...s.messages, { role: "koul", text: r.message }], choices: [], draft: null, error: null, input: s.lastSent ?? "" };
    }
    case "fail":
      if (a.id !== s.requestId || s.phase !== "sending") return s;
      return { ...s, phase: "error", error: a.message, input: s.lastSent ?? "" };
    case "timeout":
      if (a.id !== s.requestId || s.phase !== "sending") return s;
      return { ...s, phase: "error", error: "Koul took too long to answer", input: s.lastSent ?? "" };
    case "abort": {
      if (s.phase !== "sending") return s;
      const messages = s.messages.slice(0, -1);
      const last = messages[messages.length - 1];
      const phase: ChatPhase = last?.rules ? "draft" : last?.pending ? "clarify" : "idle";
      return { ...s, phase, messages, input: s.lastSent ?? "", requestId: s.requestId + 1, draft: phase === "draft" && last?.rules && last.position !== undefined ? { rules: last.rules, position: last.position } : null };
    }
    case "retry":
      if (s.phase !== "error" || !s.lastSent) return s;
      return chatReducer({ ...s, phase: "idle", error: null, messages: s.messages.filter((m, i) => !(i === s.messages.length - 1 && m.role === "user")) }, { type: "send", text: s.lastSent });
    case "discard":
      return { ...initialChatState, requestId: s.requestId + 1 };
    case "accept":
      return { ...initialChatState, requestId: s.requestId + 1, note: a.note ?? null };
    case "note":
      return { ...s, note: a.note };
  }
}
