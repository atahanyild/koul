"use client";

/**
 * Skeletons that do not flash: nothing is drawn for the first 150 ms of a load, the bars appear only when the load
 * is still going, and the content fades in over 200 ms when it lands. Every tile and list goes through this.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export const SKELETON_DELAY_MS = 150;

/** True once `loading` has been true for `ms` in a row. */
export function useDelayed(loading: boolean, ms = SKELETON_DELAY_MS): boolean {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return loading && shown;
}

export function Loadable({ loading, skeleton, className, children }: { loading: boolean; skeleton: React.ReactNode; className?: string; children: React.ReactNode }) {
  const showSkeleton = useDelayed(loading);
  if (loading) return <div className={cn("min-w-0", className)} aria-busy>{showSkeleton ? skeleton : null}</div>;
  return <div className={cn("min-w-0 animate-fade-in", className)}>{children}</div>;
}
