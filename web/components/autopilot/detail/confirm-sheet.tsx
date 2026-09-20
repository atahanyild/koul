"use client";

/**
 * A small confirmation sheet for the destructive actions on an autopilot: pause (revoke the key), remove it from
 * the router, delete a draft. When the action ends in a passkey prompt the button shows every phase of it.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { PasskeyButton, PasskeyHint } from "@/components/koul/passkey-button";
import type { ActionState } from "@/hooks/use-passkey-action";

export interface ConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** The passkey action behind the button, when there is one. Plain confirmations leave it out. */
  action?: Pick<ActionState, "phase" | "error" | "busy">;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmSheet({ open, onOpenChange, title, description, children, confirmLabel, destructive = false, action, onConfirm }: ConfirmSheetProps) {
  const busy = action?.busy ?? false;
  const footer = (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="lg" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        {action ? (
          <PasskeyButton phase={action.phase} variant={destructive ? "destructive" : "default"} onClick={() => void onConfirm()}>{confirmLabel}</PasskeyButton>
        ) : (
          <Button size="lg" variant={destructive ? "destructive" : "default"} className="min-h-11 px-4 text-[15px]" onClick={() => void onConfirm()}>{confirmLabel}</Button>
        )}
      </div>
      {action && <PasskeyHint phase={action.phase} error={action.error} onRetry={() => void onConfirm()} />}
    </div>
  );
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer} locked={busy} width="md:max-w-[460px]">
      {children && <div className="grid gap-3 pt-1 text-sm leading-relaxed">{children}</div>}
    </ResponsiveSheet>
  );
}
