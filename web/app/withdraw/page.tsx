"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WithdrawBank } from "@/components/flows/withdraw-bank";
import { WithdrawCrypto } from "@/components/flows/withdraw-crypto";
import type { Method } from "@/components/flows/flow-frame";

function WithdrawInner() {
  const router = useRouter();
  const params = useSearchParams();
  const method: Method = params.get("m") === "crypto" ? "crypto" : "bank";
  const setMethod = (m: Method) => router.replace(m === "bank" ? "/withdraw" : "/withdraw?m=crypto");
  return method === "bank" ? <WithdrawBank method={method} onMethod={setMethod} /> : <WithdrawCrypto method={method} onMethod={setMethod} />;
}

export default function WithdrawPage() {
  return (
    <React.Suspense fallback={null}>
      <WithdrawInner />
    </React.Suspense>
  );
}
