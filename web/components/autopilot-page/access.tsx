"use client";

/**
 * The access chip ("ACCESS 29D" or "NO ACCESS YET") with its "?" popover: two sentences on what the limited key
 * can and cannot do, read from the policy contract itself, days left, Revoke and Extend.
 */
import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Label, PillButton } from "@/components/signal";
import { useAgentAccess, useAgentParams } from "@/hooks/use-agent-access";
import { KOUL, XOXNO } from "@/lib/koul";
import type { AgentParams } from "@/lib/data/live";
import { cn } from "@/lib/utils";

const EXTEND_DAYS = 30;

/** The plain sentences from the actual allowlist. Falls back to the general wording when the read is not in yet. */
export function describeParams(p: AgentParams | null): string {
  if (!p) return "Koul acts for you with a limited key. It can only move USDC between your wallet and XOXNO, never anywhere else, and it stops when access ends.";
  const fns = new Set(p.allowedCalls.filter(([c]) => c === XOXNO.controller).map(([, f]) => f));
  const can: string[] = [];
  if (fns.has("supply")) can.push("put USDC from your wallet into your XOXNO position");
  if (fns.has("withdraw")) can.push("bring USDC from that position back to your wallet");
  if (fns.has("repay")) can.push("repay its debt");
  const ticks = p.allowedCalls.some(([c, f]) => c === KOUL.router && f === "tick");
  const first = can.length ? `Koul acts for you with a limited key. It can only ${can.join(", ")} on account ${p.accountId}` : ticks ? "Koul acts for you with a limited key that can only run your rules" : "Koul acts for you with a limited key";
  const recipients = p.transferRecipients.length ? ", and send USDC only to the XOXNO pool" : "";
  return `${first}${recipients}. Never anywhere else, at most ${p.maxCallsPerWindow} calls per ${Math.round((p.windowLedgers * 5) / 60)} minutes, and it stops when access ends.`;
}

export function AccessChip({ className }: { className?: string }) {
  const agent = useAgentAccess();
  const params = useAgentParams(agent.active?.ruleId ?? null);
  const busy = agent.action.busy;
  const label = !agent.loaded ? "ACCESS" : agent.active ? (agent.daysLeft === null ? "ACCESS" : `ACCESS ${agent.daysLeft}D`) : "NO ACCESS YET";
  return (
    <PopoverPrimitive.Root>
      <div className={cn("inline-flex h-11 items-center rounded-full bg-surface pl-4 pr-1", className)}>
        <span className="label mr-2 text-text">{label}</span>
        <PopoverPrimitive.Trigger
          aria-label="What Koul's access allows"
          className="mono inline-flex size-9 items-center justify-center rounded-full bg-surface-2 text-text transition-[filter] hover:brightness-110 active:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
        >
          ?
        </PopoverPrimitive.Trigger>
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <PopoverPrimitive.Popup className="w-[calc(100vw-32px)] max-w-[400px] rounded-[var(--radius-tile)] border border-line bg-surface p-6 text-text outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <div className="flex items-center justify-between">
              <PopoverPrimitive.Title className="text-[20px] font-bold">Access</PopoverPrimitive.Title>
              {agent.active ? <Label tone="lime">{agent.daysLeft === null ? "No expiry" : `${agent.daysLeft}D left`}</Label> : <Label>Not given yet</Label>}
            </div>
            <PopoverPrimitive.Description className="mt-3 text-[15px] text-muted">
              {agent.active ? describeParams(params.params) : "Access is given with your first rules: Koul gets a limited key that can only move USDC between your wallet and XOXNO, never anywhere else, and it stops when access ends."}
            </PopoverPrimitive.Description>
            {agent.active && (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <PillButton variant="outline" onClick={() => void agent.revoke(agent.active!.ruleId)} disabled={busy}>Revoke</PillButton>
                <PillButton onClick={() => void agent.extend(agent.active!.ruleId, EXTEND_DAYS)} disabled={busy} aria-busy={busy}>{busy ? "Passkey" : "Extend"}</PillButton>
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
