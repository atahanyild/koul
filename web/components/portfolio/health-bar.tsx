"use client";

/** A thin meter for loan health: red under liquidation (1.00), warning under the guard (1.25), positive above. */
import type { Health } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/** The bar spans 0 to 2.00; anything healthier sits at the end. */
const SCALE_MAX = 2;

export type HealthTone = "positive" | "warning" | "negative" | "none";

export function healthTone(h: Health): HealthTone {
  if (!h.hasLoan || h.factor === null || !Number.isFinite(h.factor)) return "none";
  if (h.factor < h.liquidationAt) return "negative";
  if (h.factor < h.minimum) return "warning";
  return "positive";
}

export function HealthBar({ health, className }: { health: Health; className?: string }) {
  const tone = healthTone(health);
  const pct = tone === "none" ? 100 : Math.min(100, Math.max(2, ((health.factor ?? 0) / SCALE_MAX) * 100));
  const fill = { positive: "bg-positive", warning: "bg-warning", negative: "bg-negative", none: "bg-positive/30" }[tone];
  const at = (v: number) => `${Math.min(100, (v / SCALE_MAX) * 100)}%`;
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} aria-hidden>
      <div className={cn("h-full rounded-full transition-[width] duration-700", fill)} style={{ width: `${pct}%` }} />
      <span className="absolute inset-y-0 w-px bg-background" style={{ left: at(health.liquidationAt) }} />
      <span className="absolute inset-y-0 w-px bg-background" style={{ left: at(health.minimum) }} />
    </div>
  );
}
