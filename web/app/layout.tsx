import type { Metadata } from "next";
import "@sembol/passkey-react/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = { title: "Koul", description: "Conditional portfolio autopilot for XOXNO lending" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <Providers>
          <header className="nav">
            <a href="/" className="brand">Koul</a>
            <nav>
              <a href="/">Wallet</a>
              <a href="/oracle">Oracle admin</a>
            </nav>
            <span className="badge">TESTNET</span>
          </header>
          <main className="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
