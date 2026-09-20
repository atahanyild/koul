import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Numbers inside a plain sentence get the tabular mono `num` treatment ("Moved 20.00 USDC to Pool B"), without touching
 * codes such as FAST-2K9M or TR33 (a digit glued to a letter is left alone).
 */
const NUM_RE = /(?<![A-Za-z])(\d[\d,]*(?:\.\d+)?%?)(?![A-Za-z])/g;

export function Numbered({ text, className }: { text: string; className?: string }) {
  const parts = text.split(NUM_RE);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => (i % 2 === 1 ? <span key={i} className={cn("num", className)}>{p}</span> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}
