"use client";

/**
 * Small shared building blocks: animated numbers, money, addresses with copy, plain-language terms with the
 * technical detail one tap away, status pills, skeletons, empty and error states, explorer links.
 */
import * as React from "react";
import Link from "next/link";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Check, Copy, ExternalLink, CircleAlert, RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { explorerTx } from "@/lib/koul";
import { fmtUsdc, fmtTry, shortAddress } from "@/lib/format";

// ---------------------------------------------------------------- numbers

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

/** Tween between values on change. Tabular figures so digits never jitter sideways. */
export function useAnimatedNumber(value: number, duration = 650): number {
  const [display, setDisplay] = React.useState(value);
  const from = React.useRef(value);
  const raf = React.useRef<number | null>(null);
  React.useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { from.current = b; setDisplay(b); return; }
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = a + (b - a) * easeOut(t);
      setDisplay(v);
      if (t < 1) raf.current = requestAnimationFrame(step);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); from.current = display; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);
  return display;
}

export function AnimatedNumber({ value, format = fmtUsdc, className, ...rest }: { value: number; format?: (n: number) => string } & Omit<React.HTMLAttributes<HTMLSpanElement>, "children">) {
  const v = useAnimatedNumber(value);
  return <span className={cn("num", className)} {...rest}>{format(v)}</span>;
}

/**
 * A USDC or TRY amount with the unit set small and the decimals lighter. `animate` tweens on change.
 */
export function Money({ value, currency = "USDC", size = "md", animate = true, signed = false, className }: { value: number; currency?: "USDC" | "TRY" | "XLM"; size?: "sm" | "md" | "lg" | "xl" | "hero"; animate?: boolean; signed?: boolean; className?: string }) {
  const shown = useAnimatedNumber(animate ? value : value, animate ? 650 : 0);
  const n = animate ? shown : value;
  const text = currency === "TRY" ? fmtTry(Math.abs(n)) : fmtUsdc(Math.abs(n));
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-2xl", xl: "text-[2rem] leading-none", hero: "text-[2.75rem] leading-none sm:text-[3.25rem]" };
  const unitSizes = { sm: "text-[0.7em]", md: "text-[0.7em]", lg: "text-[0.55em]", xl: "text-[0.45em]", hero: "text-[0.4em]" };
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "−" : "") : n < 0 ? "−" : "";
  if (currency === "TRY") {
    // Intl already places the ₺; split the decimals to lighten them.
    const m = text.match(/^(.*?)([.,]\d{2})$/);
    return (
      <span className={cn("num inline-flex items-baseline", sizes[size], className)}>
        {sign}{m ? <>{m[1]}<span className="opacity-60">{m[2]}</span></> : text}
      </span>
    );
  }
  const [int, dec] = text.split(".");
  return (
    <span className={cn("num inline-flex items-baseline gap-[0.3em]", sizes[size], className)}>
      <span>{sign}{int}<span className="opacity-60">.{dec}</span></span>
      <span className={cn("font-sans font-medium tracking-wide text-muted-foreground", unitSizes[size])}>{currency}</span>
    </span>
  );
}

// ---------------------------------------------------------------- addresses & links

export function Address({ value, head = 6, tail = 4, className, label }: { value: string; head?: number; tail?: number; className?: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ }
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copied" : `Copy ${label ?? "address"} ${value}`} title={value}
      className={cn("mono group inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 -mx-1.5 text-[0.9em] text-foreground/90 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      <span>{shortAddress(value, head, tail)}</span>
      {copied ? <Check className="size-3.5 text-positive" aria-hidden /> : <Copy className="size-3.5 text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100" aria-hidden />}
    </button>
  );
}

export function TxLink({ hash, className, children }: { hash: string; className?: string; children?: React.ReactNode }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noopener noreferrer" className={cn("inline-flex min-h-8 items-center gap-1 rounded-md text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}>
      {children ?? <span className="mono">{hash.slice(0, 8)}…</span>}
      <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">Open on stellar.expert</span>
    </a>
  );
}

// ---------------------------------------------------------------- plain language, technical detail on tap

/**
 * Wrap a plain term; tapping or focusing shows the technical name for judges who want it. Works on touch, unlike
 * a hover tooltip.
 */
export function Term({ children, detail, className }: { children: React.ReactNode; detail: React.ReactNode; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger className={cn("inline cursor-help rounded-sm underline decoration-dotted decoration-muted-foreground/60 underline-offset-[3px] hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}>
        {children}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={6} className="z-50">
          <PopoverPrimitive.Popup className="max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="mb-0.5 font-medium uppercase tracking-wider text-[10px] text-muted-foreground">Technical detail</div>
            <div className="num text-[11px]">{detail}</div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ---------------------------------------------------------------- status

export type PillTone = "neutral" | "saffron" | "positive" | "negative" | "warning" | "outline";

export function Pill({ tone = "neutral", dot = false, pulse = false, className, children }: { tone?: PillTone; dot?: boolean; pulse?: boolean; className?: string; children: React.ReactNode }) {
  const tones: Record<PillTone, string> = {
    neutral: "bg-surface-2 text-muted-foreground",
    saffron: "bg-saffron-soft text-saffron",
    positive: "bg-positive-soft text-positive",
    negative: "bg-negative-soft text-negative",
    warning: "bg-warning-soft text-warning",
    outline: "border border-border text-muted-foreground",
  };
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium tracking-wide", tones[tone], className)}>
      {dot && <span className={cn("relative inline-flex size-1.5 rounded-full bg-current", pulse && "after:absolute after:inset-0 after:animate-breathe after:rounded-full after:bg-current")} aria-hidden />}
      {children}
    </span>
  );
}

/** A breathing dot for "live" and "waiting" states. */
export function LiveDot({ tone = "positive", className }: { tone?: "positive" | "saffron" | "warning" | "muted"; className?: string }) {
  const c = { positive: "bg-positive", saffron: "bg-saffron", warning: "bg-warning", muted: "bg-muted-foreground" }[tone];
  return (
    <span className={cn("relative inline-flex size-2 shrink-0", className)} aria-hidden>
      <span className={cn("absolute inset-0 animate-breathe rounded-full opacity-60", c)} />
      <span className={cn("relative inline-flex size-2 rounded-full", c)} />
    </span>
  );
}


// ---------------------------------------------------------------- skeletons, empty, error

export function Sk({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function SkCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)} aria-busy>
      <Sk className="mb-4 h-3 w-24" />
      <Sk className="mb-3 h-7 w-40" />
      {Array.from({ length: lines }).map((_, i) => <Sk key={i} className={cn("mb-2 h-3", i % 2 ? "w-2/3" : "w-5/6")} />)}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center", className)}>
      {Icon && <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted-foreground"><Icon className="size-5" aria-hidden /></div>}
      <div className="display text-xl">{title}</div>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = "Could not load", description, onRetry, className }: { title?: string; description?: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-xl border border-negative/30 bg-negative-soft/40 p-5 sm:flex-row sm:items-center", className)}>
      <CircleAlert className="size-5 shrink-0 text-negative" aria-hidden />
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw data-icon="inline-start" /> Try again</Button>}
    </div>
  );
}

// ---------------------------------------------------------------- layout helpers

export function PageHeader({ title, eyebrow, description, actions, chips, className }: { title: React.ReactNode; eyebrow?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; chips?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label mb-2 text-muted-foreground">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="display text-[2rem] leading-none sm:text-[2.5rem]">{title}</h1>
          {chips}
        </div>
        {description && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, aside, children, className }: { title?: React.ReactNode; description?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-8 sm:mb-10", className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="label text-foreground">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ className, children, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", interactive && "transition-colors hover:border-foreground/20", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5", className)}>
      {children}
    </Link>
  );
}

/** A label/value row used in detail lists; values are tabular. */
export function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="num text-right">{children}</span>
    </div>
  );
}
