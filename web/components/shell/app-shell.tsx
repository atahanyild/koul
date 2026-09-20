"use client";

/**
 * Two navigation modes from one shell: a sidebar with the wallet chip in its footer from 768px up, a top bar plus a
 * bottom tab bar below. The content column is the same component either way.
 */
import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Gauge } from "lucide-react";
import { Brand } from "./brand";
import { SidebarNav, BottomTabs } from "./nav";
import { WalletChip } from "./wallet-chip";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface-1/60 px-4 py-5 md:flex">
        <div className="px-2"><Brand /></div>
        <div className="mt-8"><SidebarNav /></div>
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <Link href="/oracle" className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Gauge className="size-3.5" aria-hidden /> Demo controls
            </Link>
            <ThemeToggle />
          </div>
          <WalletChip variant="sidebar" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 pt-safe backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
          <Brand compact />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <WalletChip variant="topbar" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-10 md:pb-16">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : true;
  return (
    <Button variant="ghost" size="icon-lg" className="min-h-10 min-w-10 text-muted-foreground" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
