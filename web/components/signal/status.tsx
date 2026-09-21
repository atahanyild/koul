"use client";

import * as React from "react";
import { motion } from "motion/react";
import { breathe } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type StatusKind = "live" | "watching" | "editing" | "off";

/** A dot: filled lime when something is running, a hollow ring when it is not. */
export function StatusDot({ on, size = "sm", className }: { on: boolean; size?: "sm" | "md"; className?: string }) {
  const cls = cn("inline-block shrink-0 rounded-full", size === "sm" ? "size-2.5" : "size-3.5", on ? "bg-lime" : "border-2 border-dim", className);
  // A running dot breathes: a slow scale and opacity loop, nothing else moves.
  if (on) return <motion.span aria-hidden className={cls} animate={breathe.animate} transition={breathe.transition} />;
  return <span aria-hidden className={cls} />;
}

/** The status pill at the top of the Autopilot page: LIVE, EDITING, OFF. */
export function StatusPill({ kind, className }: { kind: StatusKind; className?: string }) {
  const on = kind === "live" || kind === "watching";
  return (
    <span className={cn("inline-flex h-11 items-center gap-2.5 rounded-full bg-surface px-4", className)}>
      <StatusDot on={on} />
      <span className={cn("label", on ? "text-text" : "text-muted")}>{kind.toUpperCase()}</span>
    </span>
  );
}

/** Mono, uppercase, 13 px. The voice of every secondary line in the design. */
export function Label({ tone = "muted", className, children, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "dim" | "lime" | "text" | "danger" | "onLime" }) {
  const t = { muted: "text-muted", dim: "text-dim", lime: "text-lime", text: "text-text", danger: "text-danger", onLime: "text-on-lime" }[tone];
  return (
    <span className={cn("label", t, className)} {...rest}>
      {children}
    </span>
  );
}
