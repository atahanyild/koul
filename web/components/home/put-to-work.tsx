"use client";

/**
 * "Put to work" moves the idle USDC into the hub paying most, with one passkey. The confirmation is a small dark
 * dialog on desktop and a sheet on phones, both from one component.
 */
import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { IconButton, KeyValue, Label, PillButton } from "@/components/signal";
import { usePositionActions } from "@/hooks/use-position-actions";
import { fmtPct, fmtUsdc } from "@/lib/format";
import type { Pool } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function PutToWorkDialog({ open, onOpenChange, idle, pool }: { open: boolean; onOpenChange: (o: boolean) => void; idle: number; pool: Pool | null }) {
  const actions = usePositionActions();
  const busy = actions.action.busy;
  const confirm = async () => {
    if (!pool) return;
    const res = await actions.supply(pool.id, Math.floor(idle * 100) / 100);
    if (res) onOpenChange(false);
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (busy && !o) return; onOpenChange(o); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed z-50 flex flex-col gap-5 bg-surface p-6 text-text outline-none transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            "inset-x-0 bottom-0 rounded-t-[var(--radius-tile)] pb-[max(24px,env(safe-area-inset-bottom))] data-ending-style:translate-y-full data-starting-style:translate-y-full",
            "md:inset-auto md:top-1/2 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-tile)] md:pb-6 md:data-ending-style:translate-y-[calc(-50%+8px)] md:data-ending-style:opacity-0 md:data-starting-style:translate-y-[calc(-50%+8px)] md:data-starting-style:opacity-0",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <DialogPrimitive.Title className="text-[24px] font-bold leading-tight">Put to work</DialogPrimitive.Title>
            <DialogPrimitive.Close render={<IconButton aria-label="Close" disabled={busy} />}><X className="size-5" /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="text-muted">Your idle USDC goes into the hub that pays most right now. It stays yours, in your own XOXNO position.</DialogPrimitive.Description>
          <div className="rounded-[var(--radius-group)] bg-surface-2 px-4">
            <KeyValue label="Amount" value={`${fmtUsdc(idle)} USDC`} />
            <KeyValue label="To" value={pool ? `Hub ${pool.hub} · ${fmtPct(pool.supplyApy)}` : "—"} />
          </div>
          <PillButton size="lg" full onClick={() => void confirm()} disabled={busy || !pool} aria-busy={busy}>
            {actions.action.phase === "prompt" ? "Confirm with your passkey" : actions.action.phase === "signed" || actions.action.phase === "submitting" ? "Sending to Stellar" : "Put to work"}
          </PillButton>
          <Label className="text-center">One passkey confirmation</Label>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
