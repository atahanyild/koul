"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Wallet, Landmark, Compass, Activity, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/", label: "Home", icon: House, match: (p) => p === "/" },
  { href: "/portfolio", label: "Portfolio", icon: Wallet, match: (p) => p.startsWith("/portfolio") },
  { href: "/funds", label: "Funds", icon: Landmark, match: (p) => p.startsWith("/funds") },
  { href: "/autopilots", label: "Autopilots", icon: Compass, match: (p) => p.startsWith("/autopilots") },
  { href: "/activity", label: "Activity", icon: Activity, match: (p) => p.startsWith("/activity") },
];

export function SidebarNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const on = match(path);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={cn("group flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              on ? "bg-surface-2 font-medium text-foreground" : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground")}>
            <Icon className={cn("size-[18px]", on ? "text-saffron" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={on ? 2 : 1.75} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomTabs() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-safe backdrop-blur supports-backdrop-filter:bg-background/85 md:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const on = match(path);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={cn("flex min-h-[3.75rem] flex-col items-center justify-center gap-1 text-[10.5px] font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "text-foreground" : "text-muted-foreground")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-saffron-soft")}>
                  <Icon className={cn("size-[20px]", on && "text-saffron")} strokeWidth={on ? 2.1 : 1.75} aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
