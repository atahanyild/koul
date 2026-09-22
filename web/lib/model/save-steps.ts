/**
 * The passkey steps behind Save on the Autopilot page, as the save bar shows them: which steps this save needs,
 * which are done, which one is waiting on the passkey right now, and which one failed. Pure, so the page can
 * derive it from its hooks and the bar only renders it.
 */
import type { ActionPhase } from "@/hooks/use-passkey-action";

export type SaveStepKey = "open" | "grant" | "rules";
export type SaveStepState = "done" | "active" | "pending" | "failed";

export interface SaveStep {
  key: SaveStepKey;
  label: string;
  state: SaveStepState;
  /** What is happening on the active step, or why the failed step failed. */
  detail: string | null;
}

export const STEP_LABELS: Record<SaveStepKey, string> = { open: "Open position", grant: "Give access", rules: "Save rules" };

/** The steps a save needs from where the wallet stands now. Saving rules is always the last one. */
export function planSteps(input: { needsPosition: boolean; hasAccess: boolean }): SaveStepKey[] {
  const plan: SaveStepKey[] = [];
  if (input.needsPosition) plan.push("open");
  if (!input.hasAccess) plan.push("grant");
  plan.push("rules");
  return plan;
}

/** One line per passkey action phase, in the order the kit runs them. */
export function phaseDetail(phase: ActionPhase): string | null {
  switch (phase) {
    case "building": return "Preparing the transaction";
    case "prompt": return "Confirm with your passkey";
    case "signed": return "Signed · checking with the network";
    case "submitting": return "Sent · waiting for the ledger to close";
    default: return null;
  }
}

export interface SaveProgressInput {
  plan: SaveStepKey[];
  /** Steps already done, from the chain or from this run. */
  done: Partial<Record<SaveStepKey, boolean>>;
  /** The step running right now, with its detail line. */
  active: { key: SaveStepKey; detail: string | null } | null;
  /** The step the last run stopped at, with the reason. */
  failed: { key: SaveStepKey; reason: string } | null;
}

/**
 * The plan with a state per step. A step is done when the chain says so or it succeeded in this run; the active
 * one is whichever the page is on; a failed step keeps its reason until the next attempt; the rest are pending.
 */
export function saveSteps(input: SaveProgressInput): SaveStep[] {
  return input.plan.map((key) => {
    const label = STEP_LABELS[key];
    if (input.active?.key === key) return { key, label, state: "active", detail: input.active.detail };
    if (input.done[key]) return { key, label, state: "done", detail: null };
    if (input.failed?.key === key) return { key, label, state: "failed", detail: input.failed.reason };
    return { key, label, state: "pending", detail: null };
  });
}

/** Index of the step in progress for the Steps strip: the first one not done, or the length when all are. */
export function activeIndex(steps: SaveStep[]): number {
  const i = steps.findIndex((s) => s.state !== "done");
  return i < 0 ? steps.length : i;
}
