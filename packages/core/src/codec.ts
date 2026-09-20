import { nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { autopilotSchema, type Action, type Amount, type Autopilot, type Cmp, type Condition } from "./schema.js";
import { validateAutopilot } from "./validate.js";

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const u64 = (n: string) => nativeToScVal(BigInt(n), { type: "u64" });
const i128 = (n: string) => nativeToScVal(BigInt(n), { type: "i128" });
const vec = (values: xdr.ScVal[]) => xdr.ScVal.scvVec(values);
const variant = (tag: string, values: xdr.ScVal[] = []) => vec([sym(tag), ...values]);
const entry = (key: string, val: xdr.ScVal) => new xdr.ScMapEntry({ key: sym(key), val });
const map = (entries: [string, xdr.ScVal][]) => xdr.ScVal.scvMap(entries.sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => entry(k, v)));
const cmp = (value: Cmp) => variant(value);

function encodeAmount(amount: Amount): xdr.ScVal {
  switch (amount.type) {
    case "All": return variant("All");
    case "Percent": return variant("Percent", [u32(amount.bps)]);
    case "Fixed": return variant("Fixed", [i128(amount.value)]);
  }
}
function encodeCondition(condition: Condition): xdr.ScVal {
  switch (condition.type) {
    case "HealthFactor": return variant("HealthFactor", [cmp(condition.cmp), i128(condition.level_wad)]);
    case "SupplyRateGap": return variant("SupplyRateGap", [u32(condition.hub_over), u32(condition.hub_under), u32(condition.min_bps)]);
    case "FxPrice": return variant("FxPrice", [sym(condition.asset), cmp(condition.cmp), i128(condition.level), u64(condition.max_age_secs)]);
    case "IdleBalance": return variant("IdleBalance", [cmp(condition.cmp), i128(condition.amount)]);
  }
}
function encodeAction(action: Action): xdr.ScVal {
  switch (action.type) {
    case "MoveSupply": return variant("MoveSupply", [u32(action.from_hub), u32(action.to_hub), encodeAmount(action.amount)]);
    case "RepayFromWallet": return variant("RepayFromWallet", [u32(action.hub), encodeAmount(action.amount)]);
    case "RepayWithCollateral": return variant("RepayWithCollateral", [u32(action.withdraw_hub), u32(action.repay_hub), encodeAmount(action.amount)]);
    case "WithdrawToWallet": return variant("WithdrawToWallet", [u32(action.hub), encodeAmount(action.amount)]);
  }
}

export function encodeAutopilot(input: Autopilot): xdr.ScVal {
  const errors = validateAutopilot(input);
  if (errors.length) throw new Error(errors.join("; "));
  const ap = autopilotSchema.parse(input);
  return map([
    ["account_id", u64(ap.account_id)],
    ["rules", vec(ap.rules.map((rule) => map([
      ["action", encodeAction(rule.action)],
      ["conditions", vec(rule.conditions.map(encodeCondition))],
      ["cooldown_ledgers", u32(rule.cooldown_ledgers)],
      ["match_all", xdr.ScVal.scvBool(rule.match_all)],
    ])))],
  ]);
}

type RawVariant = { tag: string; values?: unknown[] };
const rawVariant = (value: unknown): RawVariant => {
  if (Array.isArray(value) && typeof value[0] === "string") return { tag: value[0], values: value.slice(1) };
  throw new Error("Invalid contract enum");
};
const values = (value: unknown): unknown[] => rawVariant(value).values ?? [];
const asString = (value: unknown) => String(value);
const asNumber = (value: unknown) => Number(value);
const decodeCmp = (value: unknown): Cmp => rawVariant(value).tag as Cmp;
function decodeAmount(value: unknown): Amount {
  const v = rawVariant(value), a = values(value);
  if (v.tag === "All") return { type: "All" };
  if (v.tag === "Percent") return { type: "Percent", bps: asNumber(a[0]) };
  if (v.tag === "Fixed") return { type: "Fixed", value: asString(a[0]) };
  throw new Error(`Unknown amount ${v.tag}`);
}
function decodeCondition(value: unknown): Condition {
  const v = rawVariant(value), a = values(value);
  switch (v.tag) {
    case "HealthFactor": return { type: v.tag, cmp: decodeCmp(a[0]), level_wad: asString(a[1]) };
    case "SupplyRateGap": return { type: v.tag, hub_over: asNumber(a[0]), hub_under: asNumber(a[1]), min_bps: asNumber(a[2]) };
    case "FxPrice": return { type: v.tag, asset: asString(a[0]), cmp: decodeCmp(a[1]), level: asString(a[2]), max_age_secs: asString(a[3]) };
    case "IdleBalance": return { type: v.tag, cmp: decodeCmp(a[0]), amount: asString(a[1]) };
    default: throw new Error(`Unknown condition ${v.tag}`);
  }
}
function decodeAction(value: unknown): Action {
  const v = rawVariant(value), a = values(value);
  switch (v.tag) {
    case "MoveSupply": return { type: v.tag, from_hub: asNumber(a[0]), to_hub: asNumber(a[1]), amount: decodeAmount(a[2]) };
    case "RepayFromWallet": return { type: v.tag, hub: asNumber(a[0]), amount: decodeAmount(a[1]) };
    case "RepayWithCollateral": return { type: v.tag, withdraw_hub: asNumber(a[0]), repay_hub: asNumber(a[1]), amount: decodeAmount(a[2]) };
    case "WithdrawToWallet": return { type: v.tag, hub: asNumber(a[0]), amount: decodeAmount(a[1]) };
    default: throw new Error(`Unknown action ${v.tag}`);
  }
}

export function decodeAutopilot(value: xdr.ScVal): Autopilot {
  const raw = scValToNative(value) as { account_id: bigint; rules: Array<{ conditions: unknown[]; match_all: boolean; action: unknown; cooldown_ledgers: number }> };
  return autopilotSchema.parse({ account_id: String(raw.account_id), rules: raw.rules.map((rule) => ({
    conditions: rule.conditions.map(decodeCondition), match_all: rule.match_all,
    action: decodeAction(rule.action), cooldown_ledgers: rule.cooldown_ledgers,
  })) });
}
