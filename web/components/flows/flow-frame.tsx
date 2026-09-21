"use client";

/**
 * The narrow single column every Deposit and Withdraw screen sits in: a back button and title on top, the method
 * switch, one tile, and one primary button. On phones the button is pinned to the bottom, over the safe area.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Segmented } from "@/components/signal";
import { cn } from "@/lib/utils";

export type Method = "bank" | "crypto";
export const METHOD_OPTIONS = [{ value: "bank" as const, label: "Bank · TRY" }, { value: "crypto" as const, label: "Crypto · USDC" }];

export function FlowFrame({ title, back = "/", method, onMethod, children, action }: { title: React.ReactNode; back?: string; method?: Method; onMethod?: (m: Method) => void; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-[600px]", action && "pb-24 md:pb-0")}>
      <div className="flex items-center gap-4 py-2 md:py-4">
        <Link href={back} aria-label="Back" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-text transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="t-title truncate">{title}</h1>
      </div>
      {method && onMethod && <Segmented label="Method" value={method} onChange={onMethod} options={METHOD_OPTIONS} className="mt-2 mb-4" />}
      <div className="grid gap-4 [&>*]:min-w-0">{children}</div>
      {action && (
        <div className="fixed inset-x-4 bottom-0 z-30 mb-[max(16px,env(safe-area-inset-bottom))] md:static md:mt-4 md:mb-0">
          {action}
        </div>
      )}
    </div>
  );
}
