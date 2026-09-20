import { expect, it } from "vitest";
import { permissionsFor } from "./permissions";
import { healthGuard, liraShield, yieldOnly } from "./templates";
import { validateAutopilot } from "./validate";

const contracts = { router: "router", controller: "controller", pool: "pool", usdc: "usdc" };
it("templates validate and request only their action permissions", () => {
  for (const ap of [liraShield("12"), yieldOnly("12"), healthGuard("12")]) expect(validateAutopilot(ap)).toEqual([]);
  expect(permissionsFor(healthGuard("12"), contracts).allowedCalls).toEqual([["router", "tick"], ["controller", "repay"], ["usdc", "transfer"]]);
  expect(permissionsFor(yieldOnly("12"), contracts).allowedCalls).toEqual([["router", "tick"], ["controller", "withdraw"], ["controller", "supply"], ["usdc", "transfer"]]);
});
