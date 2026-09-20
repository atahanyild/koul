"use client";

import { ThemeProvider } from "next-themes";
import { PasskeyWalletProvider, SEMBOL_TESTNET_ARTIFACTS, type SembolConfig } from "@sembol/passkey-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const config: SembolConfig = {
  ...SEMBOL_TESTNET_ARTIFACTS,
  appName: "Koul",
  webAuthnHints: ["client-device", "hybrid"],
};

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <PasskeyWalletProvider config={config}>
        <TooltipProvider delay={200}>
          {children}
          <Toaster position="top-center" closeButton />
        </TooltipProvider>
      </PasskeyWalletProvider>
    </ThemeProvider>
  );
}
