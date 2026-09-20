"use client";

/**
 * Where a flow lives: a card in the right column from 1024px up, a bottom sheet below. The page decides which
 * with `useMediaQuery`; the flow components never know.
 */
import * as React from "react";
import { Landmark, Banknote, QrCode, Send, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FlowKind = "deposit" | "withdraw" | "receive" | "send";

export interface FlowProps {
  /** Report while a transfer or passkey prompt is in flight so the host cannot be closed by accident. */
  onLockedChange: (locked: boolean) => void;
  onClose: () => void;
}

export const FLOW_META: Record<FlowKind, { title: string; description: string; sub: string; icon: LucideIcon; primary?: boolean }> = {
  deposit: { title: "Deposit lira", description: "From your bank, via FAST. Nothing to sign.", sub: "From your bank", icon: Landmark, primary: true },
  withdraw: { title: "Withdraw lira", description: "To your bank, via FAST. One Face ID confirmation.", sub: "To your bank", icon: Banknote },
  receive: { title: "Receive crypto", description: "USDC and XLM on Stellar testnet.", sub: "Show your address", icon: QrCode },
  send: { title: "Send crypto", description: "To any Stellar address. Fees are covered.", sub: "To an address", icon: Send },
};

export const FLOW_ORDER: FlowKind[] = ["deposit", "withdraw", "receive", "send"];

/** The desktop card. */
export function FlowPanel({ kind, locked, onClose, children }: { kind: FlowKind; locked: boolean; onClose: () => void; children: React.ReactNode }) {
  const meta = FLOW_META[kind];
  const Icon = meta.icon;
  return (
    <section aria-labelledby={`flow-${kind}-title`} className="animate-rise rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", meta.primary ? "bg-saffron-soft text-saffron" : "bg-surface-2 text-foreground")}><Icon className="size-4" aria-hidden /></span>
            <h2 id={`flow-${kind}-title`} className="display text-2xl leading-tight">{meta.title}</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{meta.description}</p>
        </div>
        <Button variant="ghost" size="icon-lg" className="-mt-1 -mr-2 shrink-0" aria-label="Close" onClick={onClose} disabled={locked}><X /></Button>
      </div>
      {children}
    </section>
  );
}

/** The four action tiles. */
export function ActionGrid({ active, locked, onPick }: { active: FlowKind | null; locked: boolean; onPick: (k: FlowKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {FLOW_ORDER.map((k) => {
        const m = FLOW_META[k];
        const Icon = m.icon;
        const on = active === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            aria-pressed={on}
            disabled={locked && !on}
            className={cn(
              "group flex min-h-[7.25rem] flex-col items-start justify-between rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              m.primary ? "border-saffron/35 bg-saffron-soft hover:border-saffron/70" : "border-border bg-card hover:border-foreground/25",
              on && "border-foreground/40 ring-1 ring-foreground/25",
            )}
          >
            <span className={cn("flex size-10 items-center justify-center rounded-full transition-colors", m.primary ? "bg-saffron text-saffron-foreground" : "bg-surface-2 text-foreground group-hover:bg-surface-3")}>
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="mt-4 block">
              <span className="block text-[15px] font-medium leading-tight">{m.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{m.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
