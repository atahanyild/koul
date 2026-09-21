/**
 * The contract between the chat route and the page, checked with zod on both sides. Only the conditions and
 * actions the router runs today (docs/internal/ui-feasibility.md, items 4 and 5) can appear in a reply; anything
 * else is `unsupported`.
 */
import { z } from "zod";

export const conditionSchema = z.object({
  kind: z.enum(["fx_price", "health_factor", "rate_gap", "idle_usdc", "pool_rate"]),
  comparator: z.enum(["gte", "lte"]),
  value: z.number().finite().positive(),
  pool: z.enum(["A", "B"]).optional(),
}).strict();

export const actionSchema = z.object({
  kind: z.enum(["withdraw_to_wallet", "repay_from_wallet", "move_to_best_pool", "supply_from_wallet"]),
  amount: z.union([z.literal("all"), z.number().finite().min(1)]),
  pool: z.enum(["A", "B"]).optional(),
}).strict();

export const ruleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  conditions: z.array(conditionSchema).min(1).max(3),
  match: z.enum(["all", "any"]),
  action: actionSchema,
  cooldownSec: z.number().int().min(5).max(30 * 86400),
  inferred: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
}).strict();

export const chatReplySchema = z.object({
  kind: z.enum(["draft", "clarify", "unsupported"]),
  message: z.string().min(1).max(300),
  rules: z.array(ruleSchema).max(8).optional(),
  position: z.number().int().min(1).max(8).optional(),
  choices: z.array(z.string().min(1).max(40)).max(4).optional(),
  pending: ruleSchema.optional(),
}).strict().superRefine((r, ctx) => {
  if (r.kind === "draft") {
    if (!r.rules || r.rules.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a draft needs rules" });
    if (r.position === undefined || (r.rules && r.position > r.rules.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a draft needs a position inside its rules" });
  }
  if (r.kind === "clarify" && (!r.choices || r.choices.length < 2)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a clarification needs two to four quick replies" });
});

export type ChatReplyWire = z.infer<typeof chatReplySchema>;

/** The readings the assistant may quote: TRY per USD, loan health, hub rates as APY percent, idle USDC. */
export const liveContextSchema = z.object({
  fx: z.number().nullable(),
  healthFactor: z.number().nullable(),
  hasLoan: z.boolean(),
  rateA: z.number().nullable(),
  rateB: z.number().nullable(),
  idleUsdc: z.number().nullable(),
});
export type LiveContext = z.infer<typeof liveContextSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "koul"]),
  text: z.string().max(2000),
  rules: z.array(ruleSchema).max(8).optional(),
  position: z.number().int().min(1).optional(),
  pending: ruleSchema.optional(),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(24),
  rules: z.array(ruleSchema).max(8),
  mode: z.enum(["live", "editing"]),
  live: liveContextSchema,
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;
