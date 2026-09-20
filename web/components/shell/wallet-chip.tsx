"use client";

/**
 * The wallet chip: short address and USDC balance when connected, a Connect button otherwise. Its menu holds
 * copy, explorer, test XLM, theme, demo data and disconnect. On phones the menu is a bottom sheet.
 */
import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Copy, Check, ExternalLink, Droplets, Sun, Moon, LogOut, ChevronDown, ScanFace, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/use-wallet";
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
  const [funding, setFunding] = React.useState(false);
  const [showUsdcFaucet, setShowUsdcFaucet] = React.useState(false);
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
      {showUsdcFaucet ? <UsdcFaucet wallet={w.address!} onBack={() => setShowUsdcFaucet(false)} onComplete={() => void w.refetchBalances()} /> : <>
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Avatar address={w.address!} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="mono truncate text-sm">{w.address}</div>
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
        <Item icon={Droplets} onClick={() => setShowUsdcFaucet(true)}>Get test USDC</Item>
        <Item icon={resolvedTheme === "dark" ? Sun : Moon} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</Item>
        <Item icon={LogOut} danger onClick={() => { void w.disconnect(); onOpenChange(false); }}>Disconnect</Item>
      </div>
      </>}
    </ResponsiveSheet>
  );
}

type FaucetTransfer = { transferId: string; landingAccount: string; amountUsdc: string; status: "waiting" | "forwarding" | "completed"; forwardHash?: string };

function UsdcFaucet({ wallet, onBack, onComplete }: { wallet: string; onBack: () => void; onComplete: () => void }) {
  const [transfer, setTransfer] = React.useState<FaucetTransfer | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const completed = React.useRef(false);
  const completeCallback = React.useRef(onComplete);
  React.useEffect(() => { completeCallback.current = onComplete; }, [onComplete]);
  const key = `koul-usdc-faucet:${wallet}`;

  React.useEffect(() => {
    const id = localStorage.getItem(key);
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/faucet/usdc/${encodeURIComponent(id)}`).then(async (res) => {
      if (!res.ok) throw new Error("Previous faucet request could not be restored");
      return res.json() as Promise<FaucetTransfer>;
    }).then((data) => { if (!cancelled) setTransfer(data); }).catch(() => { if (!cancelled) localStorage.removeItem(key); });
    return () => { cancelled = true; };
  }, [key]);

  React.useEffect(() => {
    if (!transfer || transfer.status === "completed") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/faucet/usdc/${encodeURIComponent(transfer.transferId)}`, { cache: "no-store" });
        const data = await res.json() as FaucetTransfer & { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not check faucet transfer");
        if (cancelled) return;
        setTransfer(data);
        if (data.status === "completed" && !completed.current) { completed.current = true; localStorage.removeItem(key); completeCallback.current(); toast.success("Test USDC added to your wallet"); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    };
    const timer = setInterval(() => void poll(), 6000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [transfer, key]);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/faucet/usdc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wallet }) });
      const data = await res.json() as FaucetTransfer & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not prepare a USDC address");
      localStorage.setItem(key, data.transferId);
      completed.current = false;
      setTransfer(data);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return <div className="space-y-4 text-sm">
    <button type="button" className="flex items-center gap-2 text-muted-foreground hover:text-foreground" onClick={onBack}><ArrowLeft className="size-4" /> Wallet</button>
    <div><h3 className="font-medium">Get test USDC</h3><p className="mt-1 text-muted-foreground">Circle sends USDC to a Stellar G address. We prepare one with a USDC trustline and forward the 20 test USDC to your smart wallet.</p></div>
    {!transfer ? <Button className="w-full" disabled={busy} onClick={() => void create()}>{busy ? "Preparing address…" : "Prepare Circle faucet address"}</Button> : <>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-xs text-muted-foreground">Paste this address into Circle&apos;s faucet</p>
        <p className="num break-all text-xs">{transfer.landingAccount}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void navigator.clipboard.writeText(transfer.landingAccount).then(() => toast.success("Faucet address copied"))}><Copy className="size-4" /> Copy address</Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground"><li>Open Circle Faucet and select <strong>Stellar Testnet</strong>.</li><li>Paste the address above and request USDC.</li><li>Return here while the transfer completes.</li></ol>
      <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Open Circle Faucet <ExternalLink className="size-4" /></a>
      <p className="text-xs text-muted-foreground" role="status">{transfer.status === "completed" ? "20 test USDC arrived in your wallet." : transfer.status === "forwarding" ? "USDC received. Forwarding to your wallet…" : "Waiting for Circle to send 20 test USDC. Keep this page open, or return later."}</p>
      {transfer.status === "completed" && <Button variant="outline" className="w-full" onClick={() => { setTransfer(null); setError(null); }}>Prepare another address</Button>}
    </>}
    {error && <p className="text-xs text-negative" role="alert">{error}</p>}
  </div>;
}
