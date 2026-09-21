"use client";

/**
 * The frame around every screen. Desktop: one top row with the wordmark, the four tabs and the account chip.
 * Phone: wordmark and chip on top, a rounded tab bar at the bottom. Deposit and Withdraw drop the tab bar (and
 * the top bar on phones) and pin their own primary button. Not connected: the Welcome page, whatever the route.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { rise } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useWallet } from "@/hooks/use-wallet";
import { Sk } from "@/components/signal";
import { TopBar } from "./top-bar";
import { BottomTabs } from "./bottom-tabs";
import { ThemeColor } from "./theme-color";
import { isFlowRoute } from "./nav";
import { Welcome } from "@/components/welcome/welcome";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const w = useWallet();
  const flow = isFlowRoute(pathname);

  if (w.initializing) {
    return (
      <Frame>
        <div className="flex h-[88px] items-center justify-between">
          <Sk className="h-6 w-16" />
          <Sk className="h-11 w-28 rounded-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Sk className="h-[380px] rounded-[var(--radius-tile)]" />
          <Sk className="h-[380px] rounded-[var(--radius-tile)]" />
        </div>
      </Frame>
    );
  }

  if (!w.isConnected) {
    return (
      <Frame>
        <TopBar connected={false} />
        <Welcome />
      </Frame>
    );
  }

  return (
    <Frame className={cn(!flow && "pb-28 md:pb-12")}>
      <TopBar connected className={cn(flow && "hidden md:flex")} />
      <motion.main key={pathname} {...rise(8)} className={cn(flow && "pt-2 md:pt-0")}>{children}</motion.main>
      {!flow && <BottomTabs />}
    </Frame>
  );
}

function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1280px] px-4 pb-8 md:px-8", className)}>
      <ThemeColor />
      {children}
    </div>
  );
}
