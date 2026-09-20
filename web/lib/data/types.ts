/** Shapes every data hook returns. Mock and live implementations both produce these. */
import type { PoolId } from "@/lib/model/autopilot";

export type Source = "live" | "mock";

export interface Pool {
  id: PoolId;
  name: string;
  hub: number;
  technical: string;
  supplyApy: number; // percent
  borrowApy: number; // percent
  utilization: number; // 0..1
  availableUsdc: number; // liquid cash the pool can release
  totalSuppliedUsdc: number;
}

export interface Positions {
  idleUsdc: number;
  idleXlm: number;
  supplied: Record<PoolId, number>;
  borrowed: Record<PoolId, number>;
  /** XOXNO account id, null when the wallet has never supplied. */
  accountId: string | null;
}

export interface Health {
  /** null = no loan (infinite). */
  factor: number | null;
  hasLoan: boolean;
  minimum: number; // the guard level from the armed autopilot, if any
  liquidationAt: number; // 1.00
}

export interface FxPrice {
  tryPerUsd: number;
  /** Unix seconds of the oracle publication. */
  timestamp: number;
  ageSec: number;
  stale: boolean;
  maxAgeSec: number;
}

export type ActivityKind = "autopilot_run" | "autopilot_armed" | "autopilot_paused" | "rules_saved" | "supply" | "withdraw" | "lira_in" | "lira_out" | "crypto_in" | "crypto_out";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: number; // unix ms
  title: string;
  detail: string;
  /** Signed USDC change to the wallet+pools total, when meaningful. */
  amountUsdc?: number;
  amountTry?: number;
  txHash?: string;
  autopilotName?: string;
  ruleName?: string;
  reference?: string;
}

export interface Transfer {
  id: string;
  direction: "in" | "out";
  amountTry: number;
  amountUsdc: number;
  rate: number;
  reference: string | null;
  startedAt: number;
  steps: TransferStep[];
  status: "running" | "done" | "failed";
}

export interface TransferStep {
  id: string;
  title: string;
  /** Plain explanation shown under the title while active. */
  detail: string;
  technical: string;
  state: "done" | "active" | "pending" | "failed";
  /** Marks the step that waits on something outside Koul (the bank, the anchor). */
  waitsOn?: string;
  txHash?: string;
  at?: number;
}
