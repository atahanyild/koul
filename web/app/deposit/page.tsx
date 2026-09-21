"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DepositBank } from "@/components/flows/deposit-bank";
import { FlowFrame } from "@/components/flows/flow-frame";
import { Label, Tile } from "@/components/signal";
import type { Method } from "@/components/flows/flow-frame";

function DepositInner() {
  const router = useRouter();
  const params = useSearchParams();
  const method: Method = params.get("m") === "crypto" ? "crypto" : "bank";
  const setMethod = (m: Method) => router.replace(m === "bank" ? "/deposit" : "/deposit?m=crypto");
  if (method === "bank") return <DepositBank method={method} onMethod={setMethod} />;
  return <FlowFrame title="Deposit" method={method} onMethod={setMethod}><Tile><Label>Crypto deposits come next.</Label></Tile></FlowFrame>;
}

export default function DepositPage() {
  return (
    <React.Suspense fallback={null}>
      <DepositInner />
    </React.Suspense>
  );
}
