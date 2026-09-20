"use client";

import { useEffect, useState } from "react";

/** A clock that ticks every `intervalMs`, so relative times ("12 min ago") and countdowns stay honest on a long-open page. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
