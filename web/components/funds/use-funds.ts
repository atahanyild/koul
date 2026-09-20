"use client";

/** Small hooks and parsers shared by the funds flows. */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** A media query as a boolean, SSR-safe (false on the server and the first client render). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Whole seconds since `since`, ticking once a second while `since` is set. */
export function useElapsed(since: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
}

/** "0:07", "1:42" — the waiting timer on a timeline step. */
export const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Keep only digits and a single decimal separator; a comma is read as a decimal point. */
export function sanitizeAmount(v: string): string {
  let s = v.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const i = s.indexOf(".");
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s;
}

/** The typed amount as a positive number, or 0 when empty or invalid. */
export function parseAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Tween a number from zero once, for "it arrived" moments. */
export function useCountUpFromZero(target: number): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setV(target), 60);
    return () => clearTimeout(t);
  }, [target]);
  return v;
}
