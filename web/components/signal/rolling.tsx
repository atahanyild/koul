"use client";

/**
 * A live figure that rolls to its new value instead of swapping: "NOW 50.50" becoming "NOW 51.20" counts through
 * the digits over 420 ms, keeping the text around the number and its decimals. The first render shows the value
 * as is; only changes roll. With reduced motion on, the text just changes.
 */
import * as React from "react";
import { prefersReducedMotion } from "@/lib/count-up";

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;
const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

function parse(text: string): { value: number; decimals: number; grouped: boolean } | null {
  const m = text.match(NUMBER);
  if (!m) return null;
  const raw = m[0];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const dot = raw.indexOf(".");
  return { value, decimals: dot < 0 ? 0 : raw.length - dot - 1, grouped: raw.includes(",") };
}

export function Rolling({ text, durationMs = 420, className }: { text: string; durationMs?: number; className?: string }) {
  const [shown, setShown] = React.useState(text);
  const prev = React.useRef(text);
  React.useEffect(() => {
    const from = parse(prev.current);
    const to = parse(text);
    prev.current = text;
    if (!from || !to || from.value === to.value || prefersReducedMotion()) { setShown(text); return; }
    const run = { frame: 0, start: null as number | null };
    const fmt = (v: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: to.decimals, maximumFractionDigits: to.decimals, useGrouping: to.grouped }).format(v);
    const step = (now: number) => {
      if (run.start === null) run.start = now;
      const t = Math.min(1, (now - run.start) / durationMs);
      setShown(text.replace(NUMBER, fmt(from.value + (to.value - from.value) * EASE(t))));
      if (t < 1) run.frame = requestAnimationFrame(step);
    };
    run.frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(run.frame);
  }, [text, durationMs]);
  return <span className={className}>{shown}</span>;
}
