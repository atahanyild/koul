"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TABS } from "./nav";

/** The phone navigation: a rounded dark bar floating above the safe area, four tabs, the active one in lime. */
export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-4 bottom-0 z-40 mb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
      <ul className="grid grid-cols-4 rounded-[var(--radius-tile)] bg-surface p-1">
        {TABS.map((t) => {
          const on = t.active(pathname);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime",
                  on ? "text-lime" : "text-muted hover:text-text active:bg-surface-2",
                )}
              >
                <Icon className="size-5" strokeWidth={on ? 2.25 : 2} aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
