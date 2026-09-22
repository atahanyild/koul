import { describe, expect, it } from "vitest";
import { activeIndex, phaseDetail, planSteps, saveSteps } from "./save-steps";

describe("planSteps", () => {
  it("is only the rules when the wallet has a position and a key", () => {
    expect(planSteps({ needsPosition: false, hasAccess: true })).toEqual(["rules"]);
  });
  it("adds the key when there is none", () => {
    expect(planSteps({ needsPosition: false, hasAccess: false })).toEqual(["grant", "rules"]);
  });
  it("opens the position first on a fresh wallet", () => {
    expect(planSteps({ needsPosition: true, hasAccess: false })).toEqual(["open", "grant", "rules"]);
  });
});

describe("saveSteps", () => {
  const plan = planSteps({ needsPosition: true, hasAccess: false });

  it("starts with every step pending", () => {
    const steps = saveSteps({ plan, done: {}, active: null, failed: null });
    expect(steps.map((s) => s.state)).toEqual(["pending", "pending", "pending"]);
    expect(activeIndex(steps)).toBe(0);
  });

  it("shows the passkey line on the step in progress", () => {
    const steps = saveSteps({ plan, done: { open: true }, active: { key: "grant", detail: phaseDetail("prompt") }, failed: null });
    expect(steps.map((s) => s.state)).toEqual(["done", "active", "pending"]);
    expect(steps[1]!.detail).toBe("Confirm with your passkey");
    expect(activeIndex(steps)).toBe(1);
  });

  it("keeps the failed step and its reason until the next attempt", () => {
    const steps = saveSteps({ plan, done: {}, active: null, failed: { key: "open", reason: "The network quotes a fee of 566 XLM" } });
    expect(steps[0]).toMatchObject({ state: "failed", detail: "The network quotes a fee of 566 XLM" });
    expect(steps[1]!.state).toBe("pending");
  });

  it("marks a step done when the chain already has it, even after an earlier failure there", () => {
    const steps = saveSteps({ plan, done: { open: true }, active: null, failed: { key: "open", reason: "old" } });
    expect(steps[0]!.state).toBe("done");
  });

  it("is complete when every step is done", () => {
    const steps = saveSteps({ plan, done: { open: true, grant: true, rules: true }, active: null, failed: null });
    expect(activeIndex(steps)).toBe(3);
  });
});

describe("phaseDetail", () => {
  it("has a line for every phase the kit goes through and none for the rest", () => {
    expect(phaseDetail("building")).toBe("Preparing the transaction");
    expect(phaseDetail("prompt")).toBe("Confirm with your passkey");
    expect(phaseDetail("signed")).toBe("Signed · checking with the network");
    expect(phaseDetail("submitting")).toBe("Sent · waiting for the ledger to close");
    expect(phaseDetail("idle")).toBeNull();
    expect(phaseDetail("success")).toBeNull();
  });
});
