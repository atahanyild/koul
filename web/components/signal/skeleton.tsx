import * as React from "react";
import { cn } from "@/lib/utils";

/** A shimmering block the exact size of what it stands in for, so nothing moves when the number arrives. */
export function Sk({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton", className)} {...rest} />;
}

/** A skeleton for a tile value (48 px line). */
export function SkValue({ className }: { className?: string }) {
  return <Sk className={cn("h-12 w-40 rounded-xl", className)} />;
}

/** A skeleton for a list of rows inside a tile. */
export function SkRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-line", className)} aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex min-h-[60px] items-center justify-between gap-4 py-3">
          <Sk className="h-4 w-40" />
          <Sk className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
