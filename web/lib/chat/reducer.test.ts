import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, type ChatReply, type ChatState } from "./reducer";
import type { Rule } from "@/lib/model/autopilot";

const rule = (value = 50): Rule => ({ id: "r1", name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value }], match: "all", action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600, inferred: [], enabled: true });
const draft = (value = 50): ChatReply => ({ kind: "draft", message: "Here is the rule.", rules: [rule(value)], position: 1 });
const sent = (text = "exit at 50"): ChatState => chatReducer(initialChatState, { type: "send", text });

describe("chat reducer", () => {
  it("idle → sending on send, with the sentence as a user bubble and the input cleared", () => {
    const s = chatReducer({ ...initialChatState, input: "exit at 50" }, { type: "send" });
    expect(s.phase).toBe("sending");
    expect(s.messages).toEqual([{ role: "user", text: "exit at 50" }]);
    expect(s.input).toBe("");
    expect(s.requestId).toBe(1);
  });
  it("does not send an empty sentence", () => {
    expect(chatReducer(initialChatState, { type: "send", text: "   " })).toBe(initialChatState);
  });
  it("cannot send twice while a request is out", () => {
    const s = sent();
    expect(chatReducer(s, { type: "send", text: "again" })).toBe(s);
  });
  it("sending → draft on a draft reply", () => {
    const s = chatReducer(sent(), { type: "reply", id: 1, reply: draft() });
    expect(s.phase).toBe("draft");
    expect(s.draft).toEqual({ rules: [rule()], position: 1 });
    expect(s.messages[1]).toMatchObject({ role: "koul", rules: [rule()], position: 1 });
  });
  it("sending → clarify with quick replies", () => {
    const s = chatReducer(sent(), { type: "reply", id: 1, reply: { kind: "clarify", message: "At what level?", choices: ["50.00", "51.00"], pending: rule() } });
    expect(s.phase).toBe("clarify");
    expect(s.choices).toEqual(["50.00", "51.00"]);
    expect(s.messages[1]?.pending).toEqual(rule());
  });
  it("sending → unsupported keeps the user's text in the input", () => {
    const s = chatReducer(sent("buy gold"), { type: "reply", id: 1, reply: { kind: "unsupported", message: "Koul cannot do that." } });
    expect(s.phase).toBe("unsupported");
    expect(s.input).toBe("buy gold");
  });
  it("sending → error on a failure, keeping the text", () => {
    const s = chatReducer(sent(), { type: "fail", id: 1, message: "Could not read the answer" });
    expect(s.phase).toBe("error");
    expect(s.error).toBe("Could not read the answer");
    expect(s.input).toBe("exit at 50");
  });
  it("invalid JSON reaches the reducer as a failure, never as a draft", () => {
    const s = chatReducer(sent(), { type: "fail", id: 1, message: "The answer was not valid JSON" });
    expect(s.phase).toBe("error");
    expect(s.draft).toBeNull();
  });
  it("times out into error", () => {
    const s = chatReducer(sent(), { type: "timeout", id: 1 });
    expect(s.phase).toBe("error");
    expect(s.error).toMatch(/too long/);
  });
  it("ignores a reply, failure or timeout for an older request", () => {
    const s = sent();
    expect(chatReducer(s, { type: "reply", id: 0, reply: draft() })).toBe(s);
    expect(chatReducer(s, { type: "fail", id: 0, message: "x" })).toBe(s);
    expect(chatReducer(s, { type: "timeout", id: 0 })).toBe(s);
  });
  it("abort returns to idle with the sentence back in the input and a new request id", () => {
    const s = chatReducer(sent(), { type: "abort" });
    expect(s.phase).toBe("idle");
    expect(s.input).toBe("exit at 50");
    expect(s.messages).toEqual([]);
    expect(s.requestId).toBe(2);
    // the reply that comes back late is dropped
    expect(chatReducer(s, { type: "reply", id: 1, reply: draft() })).toBe(s);
  });
  it("a follow-up in draft goes back to sending with the whole conversation and the new draft replaces the old", () => {
    const d = chatReducer(sent(), { type: "reply", id: 1, reply: draft() });
    const again = chatReducer(d, { type: "send", text: "make it 51" });
    expect(again.phase).toBe("sending");
    expect(again.messages.map((m) => m.role)).toEqual(["user", "koul", "user"]);
    const d2 = chatReducer(again, { type: "reply", id: 2, reply: draft(51) });
    expect(d2.phase).toBe("draft");
    expect(d2.draft?.rules[0]?.conditions[0]?.value).toBe(51);
  });
  it("retry from error resends the last sentence", () => {
    const e = chatReducer(sent(), { type: "fail", id: 1, message: "x" });
    const r = chatReducer(e, { type: "retry" });
    expect(r.phase).toBe("sending");
    expect(r.requestId).toBe(2);
    expect(r.messages).toEqual([{ role: "user", text: "exit at 50" }]);
  });
  it("discard clears the conversation and accept ends the draft with a note", () => {
    const d = chatReducer(sent(), { type: "reply", id: 1, reply: draft() });
    expect(chatReducer(d, { type: "discard" })).toMatchObject({ phase: "idle", messages: [], draft: null, input: "" });
    const a = chatReducer(d, { type: "accept", note: "Changed rule 2 · 50.00 → 51.00" });
    expect(a).toMatchObject({ phase: "idle", messages: [], draft: null, note: "Changed rule 2 · 50.00 → 51.00" });
    // the next send clears the note
    expect(chatReducer(a, { type: "send", text: "more" }).note).toBeNull();
  });
});
