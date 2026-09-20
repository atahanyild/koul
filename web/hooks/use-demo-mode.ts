"use client";

import { createLocalStore } from "@/lib/data/store";

const DEFAULT = process.env.NEXT_PUBLIC_KOUL_DEMO_DATA !== "0";
const store = createLocalStore<boolean>("koul.demoData", DEFAULT);

/**
 * Demo mode overlays the consistent sample story wherever the chain has nothing for this wallet (no position, no
 * rules, no events). Live reads always win when they return something. Off, the true empty states show.
 */
export function useDemoMode(): [boolean, (v: boolean) => void] {
  const [v, set] = store.use();
  return [v, set];
}
