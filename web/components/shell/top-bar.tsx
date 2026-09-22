"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/signal";
import { AccountChip } from "./account-chip";
import { TABS } from "./nav";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Koul home" className={cn("inline-flex h-11 items-center text-[20px] font-extrabold tracking-[-0.04em] text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text", className)}>
      KOUL
    </Link>
  );
}

/**
 * One row: the wordmark, a thin divider, the four tabs in large type, the account chip on the right.
 * `connected=false` is the Welcome variant: wordmark and the network label, nothing else.
 */
export function TopBar({ connected, className }: { connected: boolean; className?: string }) {
  const pathname = usePathname();
  return (
    <header className={cn("flex h-[88px] items-center justify-between gap-6", className)}>
      <div className="flex min-w-0 items-center gap-6">
        <Wordmark />
        {connected && (
          <>
            <span aria-hidden className="hidden h-8 w-px bg-line md:block" />
            <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
              {TABS.map((t) => {
                const on = t.active(pathname);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={on ? "page" : undefined}
                    className={cn("t-tab rounded-md py-1 transition-colors duration-[240ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-text", on ? "text-text" : "text-dim hover:text-muted active:text-text")}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
      {connected ? <AccountChip /> : <Label>Stellar testnet</Label>}
    </header>
  );
}
