"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A small copy affordance with a two-second "copied" check. Icon-only by default; pass children for a label. */
export function CopyButton({ text, label, className, children, size = "icon-sm", variant = "ghost" }: { text: string; label: string; className?: string; children?: React.ReactNode; size?: React.ComponentProps<typeof Button>["size"]; variant?: React.ComponentProps<typeof Button>["variant"] }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <Button type="button" size={size} variant={variant} onClick={copy} aria-label={copied ? "Copied" : `Copy ${label}`} aria-live="polite" className={cn("min-h-8 min-w-8 shrink-0 text-muted-foreground hover:text-foreground", className)}>
      {copied ? <Check className="size-3.5 text-positive" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {children && <span>{copied ? "Copied" : children}</span>}
    </Button>
  );
}
