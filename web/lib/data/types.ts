/** Shapes every data hook returns, all read from testnet. */
import type { PoolId } from "@/lib/model/autopilot";

export interface Pool {
  id: PoolId;
  name: string;
  hub: number;
  technical: string;
  /** Annualised deposit rate straight from the pool (APR, percent). The router's rate-gap rule compares these. */
  supplyApr: number;
  borrowApr: number;
  /** The same rates compounded, as XOXNO's app shows them (APY, percent). */
  supplyApy: number;
  borrowApy: number;
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
  /** Server transfer id from the funds routes, once created. */
  transferId: string | null;
  amountTry: number;
  amountUsdc: number;
  rate: number;
  reference: string | null;
  /** FAST instructions from the anchor (deposit): IBAN, recipient name, reference. */
  instructions: Record<string, { value: string; description?: string }> | null;
  /** Unsigned USDC transfer the user signs (withdrawal), as AssembledTransaction JSON. */
  unsignedTransfer: string | null;
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
