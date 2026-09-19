import type { Metadata } from "next";
import "@sembol/passkey-react/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = { title: "Niet", description: "Conditional portfolio autopilot for XOXNO lending" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="nav">
            <a href="/" className="brand">Niet</a>
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
