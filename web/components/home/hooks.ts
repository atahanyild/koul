"use client";

import * as React from "react";

/** A wall clock that only ticks on the client: null until mounted so server and client markup match. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** True while the element is inside the viewport. Starts true so nothing flashes before the observer runs. */
export function useInView<T extends Element>(ref: React.RefObject<T | null>, rootMargin = "0px"): boolean {
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}
