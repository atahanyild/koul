"use client";

/** Keeps the browser chrome (the address bar on phones) on the ground colour of the theme in use. */
import * as React from "react";
import { useTheme } from "next-themes";

/** The two grounds, the same values as --background in globals.css; a meta tag cannot read a CSS variable. */
const COLORS = { dark: "#000000", light: "#f2f2ed" } as const;

export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    const color = resolvedTheme === "light" ? COLORS.light : COLORS.dark;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = color;
  }, [resolvedTheme]);
  return null;
}
