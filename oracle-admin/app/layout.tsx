import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Koul Oracle Admin", description: "Testnet mock FX oracle control" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body><header><a href="/oracle">Koul Oracle Admin</a><span>TESTNET</span></header><main>{children}</main></body></html>;
}
