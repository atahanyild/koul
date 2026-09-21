"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DepositBank } from "@/components/flows/deposit-bank";
import { DepositCrypto } from "@/components/flows/deposit-crypto";
import type { Method } from "@/components/flows/flow-frame";

function DepositInner() {
  const router = useRouter();
  const params = useSearchParams();
  const method: Method = params.get("m") === "crypto" ? "crypto" : "bank";
  const setMethod = (m: Method) => router.replace(m === "bank" ? "/deposit" : "/deposit?m=crypto");
  return method === "bank" ? <DepositBank method={method} onMethod={setMethod} /> : <DepositCrypto method={method} onMethod={setMethod} />;
}

export default function DepositPage() {
  return (
    <React.Suspense fallback={null}>
      <DepositInner />
    </React.Suspense>
  );
}
