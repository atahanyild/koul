import { House, List, SlidersHorizontal, User, type LucideIcon } from "lucide-react";

export interface Tab { href: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean }

/** The four tabs. Deposit and Withdraw are reached from Home and Account and light the Account tab. */
export const TABS: Tab[] = [
  { href: "/", label: "Home", icon: House, active: (p) => p === "/" },
  { href: "/autopilot", label: "Autopilot", icon: SlidersHorizontal, active: (p) => p.startsWith("/autopilot") },
  { href: "/activity", label: "Activity", icon: List, active: (p) => p.startsWith("/activity") },
  { href: "/account", label: "Account", icon: User, active: (p) => p.startsWith("/account") || p.startsWith("/deposit") || p.startsWith("/withdraw") },
];

/** Deposit and Withdraw are narrow single-column flows: no bottom tab bar, and on phones no top bar either. */
export const isFlowRoute = (pathname: string) => pathname.startsWith("/deposit") || pathname.startsWith("/withdraw");
