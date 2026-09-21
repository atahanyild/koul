"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WithdrawBank } from "@/components/flows/withdraw-bank";
import { FlowFrame } from "@/components/flows/flow-frame";
import { Label, Tile } from "@/components/signal";
import type { Method } from "@/components/flows/flow-frame";

function WithdrawInner() {
  const router = useRouter();
  const params = useSearchParams();
  const method: Method = params.get("m") === "crypto" ? "crypto" : "bank";
  const setMethod = (m: Method) => router.replace(m === "bank" ? "/withdraw" : "/withdraw?m=crypto");
  if (method === "bank") return <WithdrawBank method={method} onMethod={setMethod} />;
  return <FlowFrame title="Withdraw" method={method} onMethod={setMethod}><Tile><Label>Crypto withdrawals come next.</Label></Tile></FlowFrame>;
}

export default function WithdrawPage() {
  return (
    <React.Suspense fallback={null}>
      <WithdrawInner />
    </React.Suspense>
  );
}
