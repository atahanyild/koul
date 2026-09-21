import * as React from "react";
import { cn } from "@/lib/utils";

/** A bold line, a mono line, and at most one button. Drawn inside whichever tile is empty. */
export function EmptyState({ title, line, action, className }: { title: string; line: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-10 text-center", className)}>
      <div className="text-[20px] font-bold">{title}</div>
      <div className="label text-muted">{line}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
