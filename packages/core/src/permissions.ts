import type { Autopilot } from "./schema";
import { validateAutopilot } from "./validate";

export interface AgentPermissions {
  allowedCalls: Array<[contractId: string, method: string]>;
  transferRecipients: string[];
  descriptions: string[];
}
export interface PermissionContracts { router: string; controller: string; pool: string; usdc: string }

/** Union of the calls that the autopilot can make, including XOXNO's token transfer to its pool. */
export function permissionsFor(ap: Autopilot, contracts: PermissionContracts): AgentPermissions {
  const errors = validateAutopilot(ap);
  if (errors.length) throw new Error(errors.join("; "));
  const kinds = new Set(ap.rules.map((r) => r.action.type));
  const allowedCalls: AgentPermissions["allowedCalls"] = [[contracts.router, "tick"]];
  const descriptions = ["Check and run the first eligible autopilot rule"];
  const needsWithdraw = kinds.has("MoveSupply") || kinds.has("RepayWithCollateral") || kinds.has("WithdrawToWallet");
  const needsSupply = kinds.has("MoveSupply") || kinds.has("SupplyFromWallet");
  const needsRepay = kinds.has("RepayFromWallet") || kinds.has("RepayWithCollateral");
  if (needsWithdraw) { allowedCalls.push([contracts.controller, "withdraw"]); descriptions.push("Withdraw USDC from your own XOXNO position to your wallet"); }
  if (needsSupply) { allowedCalls.push([contracts.controller, "supply"]); descriptions.push(kinds.has("SupplyFromWallet") ? "Put idle USDC from your wallet into your own XOXNO position" : "Supply wallet USDC to your own XOXNO position"); }
  if (needsRepay) { allowedCalls.push([contracts.controller, "repay"]); descriptions.push("Repay debt on your own XOXNO position"); }
  if (needsSupply || needsRepay) { allowedCalls.push([contracts.usdc, "transfer"]); descriptions.push("Transfer USDC from your wallet to the XOXNO pool"); }
  return { allowedCalls, transferRecipients: needsSupply || needsRepay ? [contracts.pool] : [], descriptions };
}
