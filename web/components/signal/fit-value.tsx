import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The size class for a tile value: 36 px on phones and 48 px from tablets up, stepping down as the string grows,
 * so a five or six digit balance stays inside a half-width tile on a phone instead of running past its edge.
 */
export function fitValueClass(text: string, base = "t-value"): string {
  const n = text.length;
  return cn(base, "num min-w-0 truncate", n > 9 ? "text-[22px] md:text-[32px]" : n > 7 ? "text-[26px] md:text-[36px]" : n > 5 ? "text-[30px] md:text-[42px]" : "");
}

/** A tile value that fits its tile: shrinks for long numbers, truncates with the full text as a title past that. */
export function FitValue({ text, className, ...rest }: React.HTMLAttributes<HTMLDivElement> & { text: string }) {
  return (
    <div className={cn(fitValueClass(text), className)} title={text.length > 9 ? text : undefined} {...rest}>
      {text}
    </div>
  );
}
