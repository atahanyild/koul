"use client";

/** The one primary action: create a wallet when there is none, deposit lira once there is. */
import * as React from "react";
import Link from "next/link";
import { ScanFace, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sk } from "@/components/koul/primitives";
import { ConnectSheet } from "@/components/shell/connect-panel";
import { useWallet } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";

export function PrimaryCta({ className, tabIndex }: { className?: string; tabIndex?: number }) {
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  const cls = cn("min-h-12 px-5 text-[15px]", className);
  if (w.initializing) return <Sk className={cn("h-12 w-44 rounded-lg", className)} />;
  if (w.isConnected) {
    return (
      <Button size="lg" className={cls} nativeButton={false} render={<Link href="/funds" />} tabIndex={tabIndex}>
        <Landmark data-icon="inline-start" /> Deposit lira
      </Button>
    );
  }
  return (
    <>
      <Button size="lg" className={cls} onClick={() => setOpen(true)} tabIndex={tabIndex}>
        <ScanFace data-icon="inline-start" /> Create wallet
      </Button>
      <ConnectSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Phone only: the primary action floats above the tab bar while the hero's button is scrolled away. */
export function StickyCta({ show }: { show: boolean }) {
  return (
    <div
      className={cn(
        "sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mt-2 transition-[opacity,transform] duration-200 md:hidden",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
      )}
      aria-hidden={!show}
    >
      <div className="rounded-2xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/85">
        <PrimaryCta className="w-full" tabIndex={show ? undefined : -1} />
      </div>
    </div>
  );
}
