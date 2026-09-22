"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/use-wallet";
import { Sk } from "@/components/signal";

/** CBHM…UUFL in a dark pill. It is the way to Account from anywhere. */
export function AccountChip({ className }: { className?: string }) {
  const w = useWallet();
  if (w.initializing || !w.address) return <Sk className={cn("h-11 w-28 rounded-full", className)} />;
  const short = `${w.address.slice(0, 4)}…${w.address.slice(-4)}`;
  return (
    <Link
      href="/account"
      aria-label={`Account ${w.address}`}
      className={cn("mono inline-flex h-11 items-center rounded-full bg-surface px-5 text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text", className)}
    >
      {short}
    </Link>
  );
}
