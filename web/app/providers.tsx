"use client";

import { PasskeyWalletProvider, SEMBOL_TESTNET_ARTIFACTS, type SembolConfig } from "@sembol/passkey-react";

const config: SembolConfig = {
  ...SEMBOL_TESTNET_ARTIFACTS,
  appName: "Niet",
  webAuthnHints: ["client-device", "hybrid"],
};

export function Providers({ children }: { children: React.ReactNode }) {
  return <PasskeyWalletProvider config={config}>{children}</PasskeyWalletProvider>;
}
