import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Koul mark: a dial with the needle resting at "armed". */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.2" fill="var(--clay)" />
      <path d="M12 12 L17.5 7.5" stroke="var(--clay)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)} aria-label="Koul home">
      <Mark />
      <span className="display text-[1.35rem] leading-none">Koul</span>
      {!compact && <span className="ml-1 rounded-full border border-border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Testnet</span>}
    </Link>
  );
}
