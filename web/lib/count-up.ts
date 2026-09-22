"use client";

/**
 * A number that rolls to its value instead of jumping: `useCountUp(1250)` returns 0 on the first frame and reaches
 * 1250 about 700 ms later, eased out. Later changes roll from the current figure. With reduced motion on, the value
 * is returned as is. Tabular figures on the element keep the width steady while the digits change.
 */
import { useEffect, useState } from "react";

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCountUp(value: number | null, durationMs = 700): number | null {
  const [shown, setShown] = useState<number | null>(value === null ? null : 0);
  useEffect(() => {
    if (value === null) return;
    const reduced = prefersReducedMotion();
    const run = { frame: 0, start: null as number | null, from: null as number | null };
    const step = (now: number) => {
      if (reduced) { setShown(value); return; }
      if (run.start === null) run.start = now;
      const t = Math.min(1, (now - run.start) / durationMs);
      setShown((s) => { run.from ??= s ?? 0; return run.from + (value - run.from) * EASE(t); });
      if (t < 1) run.frame = requestAnimationFrame(step);
    };
    run.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(run.frame);
  }, [value, durationMs]);
  return value === null ? null : shown;
}
