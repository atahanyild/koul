import { z } from "zod";

// Decimal strings keep i128/u64 values exact in JSON and structured model output.
const uint = z.number().int().min(0).max(0xffffffff);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const positive = decimal.refine((v) => BigInt(v) > 0n, "Must be positive");
export const cmpSchema = z.enum(["Below", "AtOrAbove"]);
export const amountSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("All") }).strict(),
  z.object({ type: z.literal("Percent"), bps: uint }).strict(),
  z.object({ type: z.literal("Fixed"), value: positive }).strict(),
]);
export const conditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("HealthFactor"), cmp: cmpSchema, level_wad: positive }).strict(),
  z.object({ type: z.literal("SupplyRateGap"), hub_over: uint, hub_under: uint, min_bps: uint }).strict(),
  z.object({ type: z.literal("SupplyRate"), hub: uint, cmp: cmpSchema, bps: uint }).strict(),
  z.object({ type: z.literal("FxPrice"), asset: z.string().min(1).max(32), cmp: cmpSchema, level: positive, max_age_secs: decimal }).strict(),
  z.object({ type: z.literal("IdleBalance"), cmp: cmpSchema, amount: decimal }).strict(),
]);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MoveSupply"), from_hub: uint, to_hub: uint, amount: amountSchema }).strict(),
  z.object({ type: z.literal("SupplyFromWallet"), hub: uint, amount: amountSchema }).strict(),
  z.object({ type: z.literal("RepayFromWallet"), hub: uint, amount: amountSchema }).strict(),
  z.object({ type: z.literal("RepayWithCollateral"), withdraw_hub: uint, repay_hub: uint, amount: amountSchema }).strict(),
  z.object({ type: z.literal("WithdrawToWallet"), hub: uint, amount: amountSchema }).strict(),
]);
export const ruleSchema = z.object({
  conditions: z.array(conditionSchema).min(1).max(3),
  match_all: z.boolean(),
  action: actionSchema,
  cooldown_ledgers: uint,
}).strict();
export const autopilotSchema = z.object({
  account_id: decimal,
  rules: z.array(ruleSchema).min(1).max(32),
}).strict();

export type Cmp = z.infer<typeof cmpSchema>;
export type Amount = z.infer<typeof amountSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Autopilot = z.infer<typeof autopilotSchema>;

export interface ConditionState { holds: boolean; observed: bigint }
export interface RuleState { ready: boolean; holds: boolean; conditions: ConditionState[]; last_fired: number }
export interface Executed { rule_index: number; kind: string; amount: bigint; from_hub: number; to_hub: number }
