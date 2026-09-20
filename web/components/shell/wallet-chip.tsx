"use client";

/**
 * The wallet chip: short address and USDC balance when connected, a Connect button otherwise. Its menu holds
 * copy, explorer, test XLM, theme, demo data and disconnect. On phones the menu is a bottom sheet.
 */
import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Copy, Check, ExternalLink, Droplets, Sun, Moon, LogOut, ChevronDown, ScanFace, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWallet } from "@/hooks/use-wallet";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { explorerContract } from "@/lib/koul";
import { fmtUsdc } from "@/lib/format";
import { Sk } from "@/components/koul/primitives";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { ConnectSheet } from "./connect-panel";

export function WalletChip({ variant = "sidebar" }: { variant?: "sidebar" | "topbar" }) {
  const w = useWallet();
  const [open, setOpen] = React.useState(false);
  const [connectOpen, setConnectOpen] = React.useState(false);

  if (w.initializing) {
    return variant === "sidebar" ? <div className="rounded-xl border border-border p-3"><Sk className="mb-2 h-3 w-20" /><Sk className="h-4 w-28" /></div> : <Sk className="h-9 w-24 rounded-full" />;
  }

  if (!w.isConnected) {
    return (
      <>
        <Button size={variant === "sidebar" ? "lg" : "default"} className={cn("min-h-10 rounded-full", variant === "sidebar" && "w-full")} onClick={() => setConnectOpen(true)}>
          <ScanFace data-icon="inline-start" /> Connect
        </Button>
        <ConnectSheet open={connectOpen} onOpenChange={setConnectOpen} />
      </>
    );
  }

  const trigger = variant === "sidebar" ? (
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Avatar address={w.address!} />
      <div className="min-w-0 flex-1">
        <div className="num truncate text-[13px]">{w.short}</div>
        <div className="num text-xs text-muted-foreground">{w.usdc === null ? "—" : `${fmtUsdc(w.usdc)} USDC`}</div>
      </div>
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
    </button>
  ) : (
    <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
      className="flex min-h-10 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Avatar address={w.address!} size="sm" />
      <span className="num text-[13px]">{w.short}</span>
    </button>
  );

  return (
    <>
      {trigger}
      <WalletMenu open={open} onOpenChange={setOpen} />
    </>
  );
}

/** A deterministic two-tone disc from the address, so the same wallet always looks the same. */
export function Avatar({ address, size = "md", className }: { address: string; size?: "sm" | "md" | "lg"; className?: string }) {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const s = { sm: "size-7", md: "size-9", lg: "size-12" }[size];
  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full", s, className)} aria-hidden
      style={{ background: `conic-gradient(from ${hue}deg, oklch(0.75 0.12 ${hue}), oklch(0.55 0.1 ${(hue + 60) % 360}) 50%, oklch(0.75 0.12 ${hue}))` }}>
      <span className="absolute inset-[30%] rounded-full bg-background/90" />
    </span>
  );
}

function WalletMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const w = useWallet();
  const { resolvedTheme, setTheme } = useTheme();
  const [demo, setDemo] = useDemoMode();
  const [funding, setFunding] = React.useState(false);
  const fund = async () => {
    setFunding(true);
    try { const r = await w.fund(); if (r.success) toast.success("Test XLM added", { description: "Friendbot topped up this wallet." }); else toast.error("Friendbot declined", { description: "This wallet may already be funded." }); }
    catch (e) { toast.error("Could not fund", { description: e instanceof Error ? e.message : String(e) }); }
    finally { setFunding(false); await w.refetchBalances(); }
  };
  const Item = ({ icon: Icon, children, onClick, href, danger }: { icon: React.ElementType; children: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean }) => {
    const cls = cn("flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", danger && "text-negative");
    if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}><Icon className="size-4 text-muted-foreground" aria-hidden />{children}<ExternalLink className="ml-auto size-3.5 text-muted-foreground" aria-hidden /></a>;
    return <button type="button" onClick={onClick} className={cls}><Icon className={cn("size-4", danger ? "text-negative" : "text-muted-foreground")} aria-hidden />{children}</button>;
  };
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="Your wallet" description="A passkey smart account on Stellar testnet. No seed phrase, nothing to write down." width="md:max-w-[420px]">
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Avatar address={w.address!} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="num truncate text-sm">{w.address}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span className="num">{w.usdc === null ? "—" : `${fmtUsdc(w.usdc)} USDC`}</span>
            <span className="num">{w.xlm === null ? "—" : `${fmtUsdc(w.xlm)} XLM`}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <Item icon={w.copied ? Check : Copy} onClick={() => void w.copy()}>{w.copied ? "Copied" : "Copy address"}</Item>
        <Item icon={ExternalLink} href={explorerContract(w.address!)}>View on stellar.expert</Item>
        <Item icon={Droplets} onClick={() => void fund()}>{funding ? "Asking friendbot…" : "Add test XLM"}</Item>
        <Item icon={resolvedTheme === "dark" ? Sun : Moon} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</Item>
        <label className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-surface-2">
          <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
          <span className="flex-1">Show sample data<span className="block text-xs text-muted-foreground">Until the chain has data for this wallet</span></span>
          <Switch checked={demo} onCheckedChange={(v) => setDemo(!!v)} aria-label="Show sample data" />
        </label>
        <Item icon={LogOut} danger onClick={() => { void w.disconnect(); onOpenChange(false); }}>Disconnect</Item>
      </div>
    </ResponsiveSheet>
  );
}
