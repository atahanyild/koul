import * as React from "react";
import { cn } from "@/lib/utils";

export type TileTone = "surface" | "lime" | "dashed" | "outlined" | "flat";

/**
 * The building block of every screen: a filled block with 24 px corners and no border. `lime` is reserved for the
 * balance tile and the composer, `dashed` for empty states, `outlined` for the rule row being edited.
 */
export function Tile({ tone = "surface", padded = true, className, children, ref, ...rest }: React.HTMLAttributes<HTMLDivElement> & { tone?: TileTone; padded?: boolean; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-tile)]",
        padded && "p-5 md:p-7",
        tone === "surface" && "bg-surface",
        tone === "lime" && "bg-lime text-on-lime",
        tone === "dashed" && "border-2 border-dashed border-line bg-transparent",
        tone === "outlined" && "border border-accent-text bg-surface",
        tone === "flat" && "bg-transparent",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The small heading at the top of a tile: "Balance", "Positions", "Autopilot". */
export function TileLabel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("t-tile-label text-muted", className)} {...rest}>
      {children}
    </div>
  );
}
