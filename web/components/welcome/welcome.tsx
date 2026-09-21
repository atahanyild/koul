"use client";

import { Tile } from "@/components/signal";

/** Placeholder until the Welcome screen lands in its own step. */
export function Welcome() {
  return (
    <Tile tone="lime" className="min-h-[320px]">
      <div className="text-[16px] font-bold">Set the rules once. Koul does the rest.</div>
      <h1 className="t-headline mt-6">Your dollars on autopilot.</h1>
    </Tile>
  );
}
