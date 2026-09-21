/** The page's side of the chat route: one POST, the reply checked against the same schema, errors as sentences. */
import type { Rule } from "@/lib/model/autopilot";
import type { ChatMessage, ChatReply } from "./reducer";
import { chatReplySchema, type LiveContext } from "./schema";

export async function askKoul(body: { messages: ChatMessage[]; rules: Rule[]; mode: "live" | "editing"; live: LiveContext }, signal: AbortSignal): Promise<ChatReply> {
  let res: Response;
  try {
    res = await fetch("/api/autopilot/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Koul could not be reached");
  }
  let raw: unknown;
  try { raw = await res.json(); } catch { throw new Error("The answer was not valid JSON"); }
  if (!res.ok) throw new Error(typeof (raw as { error?: unknown })?.error === "string" ? (raw as { error: string }).error : `Koul answered ${res.status}`);
  const parsed = chatReplySchema.safeParse(raw);
  if (!parsed.success) throw new Error("The answer did not match what the page expects");
  return parsed.data as ChatReply;
}
