import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans-family", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono-family", display: "swap" });
/** Headlines. One voice, no serif; the grotesque carries the weight. */
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-family", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Koul", template: "%s · Koul" },
  description: "Your lira, earning in dollars, on rules you can read. A conditional portfolio autopilot on Stellar.",
  applicationName: "Koul",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Koul" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#241c17" },
    { media: "(prefers-color-scheme: light)", color: "#f8f3ec" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(sans.variable, mono.variable, display.variable)} suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
