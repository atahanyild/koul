/** How each kind of activity looks and which filter it belongs to. */
import { Compass, KeyRound, Pause, ScrollText, ArrowDownLeft, ArrowUpRight, PiggyBank, HandCoins, type LucideIcon } from "lucide-react";
import type { ActivityKind } from "@/lib/data/types";

export type IconTone = "clay" | "positive" | "neutral" | "muted";

export const KIND: Record<ActivityKind, { icon: LucideIcon; tone: IconTone; label: string }> = {
  autopilot_run: { icon: Compass, tone: "clay", label: "Autopilot ran" },
  autopilot_armed: { icon: KeyRound, tone: "muted", label: "Key granted" },
  autopilot_paused: { icon: Pause, tone: "muted", label: "Key revoked" },
  rules_saved: { icon: ScrollText, tone: "muted", label: "Rules saved" },
  lira_in: { icon: ArrowDownLeft, tone: "positive", label: "Lira in" },
  crypto_in: { icon: ArrowDownLeft, tone: "positive", label: "Crypto in" },
  lira_out: { icon: ArrowUpRight, tone: "neutral", label: "Lira out" },
  crypto_out: { icon: ArrowUpRight, tone: "neutral", label: "Crypto out" },
  supply: { icon: PiggyBank, tone: "neutral", label: "Supplied" },
  withdraw: { icon: HandCoins, tone: "neutral", label: "Withdrew" },
};

export const TONE_CLASS: Record<IconTone, string> = {
  clay: "bg-clay-soft text-clay",
  positive: "bg-positive-soft text-positive",
  neutral: "bg-surface-2 text-foreground",
  muted: "bg-surface-2 text-muted-foreground",
};

export type FilterKey = "all" | "autopilot" | "money";

export const FILTERS: { key: FilterKey; label: string; kinds: ActivityKind[] | null }[] = [
  { key: "all", label: "All", kinds: null },
  { key: "autopilot", label: "Autopilot", kinds: ["autopilot_run", "autopilot_armed", "autopilot_paused", "rules_saved"] },
  { key: "money", label: "Money in and out", kinds: ["lira_in", "lira_out", "crypto_in", "crypto_out", "supply", "withdraw"] },
];

export const filterKinds = (key: FilterKey) => FILTERS.find((f) => f.key === key)?.kinds ?? null;
