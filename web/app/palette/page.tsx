"use client";

/**
 * A throwaway page to choose the palette: the same hero, buttons, chips and market card in each candidate.
 * Every block overrides the colour tokens, so what you see is what the app would look like. Delete this route
 * once a palette is picked.
 */
import * as React from "react";
import type { CSSProperties } from "react";
import { ArrowUpRight, ScanFace } from "lucide-react";

interface Palette {
  id: string;
  name: string;
  note: string;
  /** Accent name for the caption. */
  accent: string;
  vars: Record<string, string>;
}

/** Every option keeps the same structure: a canvas, a raised card, one accent, and the two signal colours. */
const PALETTES: Palette[] = [
  {
    id: "now",
    name: "0. What is on the site now",
    note: "Saffron on cool ink. Close to Sembol's gold, which is the problem.",
    accent: "Saffron 82",
    vars: {
      "--background": "oklch(0.15 0.012 255)", "--surface-1": "oklch(0.185 0.012 255)", "--surface-2": "oklch(0.225 0.012 255)", "--surface-3": "oklch(0.27 0.012 255)",
      "--foreground": "oklch(0.95 0.008 90)", "--muted-foreground": "oklch(0.7 0.012 255)", "--hairline": "oklch(1 0 0 / 9%)",
      "--accent-c": "oklch(0.84 0.155 82)", "--accent-fg": "oklch(0.2 0.03 80)",
      "--positive": "oklch(0.8 0.13 160)", "--negative": "oklch(0.74 0.16 25)",
    },
  },
  {
    id: "iris",
    name: "1. Iris on graphite",
    note: "A cold violet against a neutral graphite. Reads like software, not like a bank or a bazaar. Nothing in the Stellar or XOXNO world looks like this.",
    accent: "Iris 292",
    vars: {
      "--background": "oklch(0.155 0.006 270)", "--surface-1": "oklch(0.19 0.007 270)", "--surface-2": "oklch(0.235 0.008 270)", "--surface-3": "oklch(0.285 0.01 270)",
      "--foreground": "oklch(0.96 0.004 270)", "--muted-foreground": "oklch(0.7 0.012 270)", "--hairline": "oklch(1 0 0 / 10%)",
      "--accent-c": "oklch(0.72 0.19 292)", "--accent-fg": "oklch(0.99 0.01 292)",
      "--positive": "oklch(0.8 0.13 160)", "--negative": "oklch(0.72 0.17 20)",
    },
  },
  {
    id: "signal",
    name: "2. Signal red on true black",
    note: "One hot red on real black, the No Name register. Loud, confident, and it makes a firing rule feel like an event. Careful: red also means danger, so the negative colour moves to amber.",
    accent: "Signal 25",
    vars: {
      "--background": "oklch(0.09 0 0)", "--surface-1": "oklch(0.135 0 0)", "--surface-2": "oklch(0.18 0 0)", "--surface-3": "oklch(0.24 0 0)",
      "--foreground": "oklch(0.97 0 0)", "--muted-foreground": "oklch(0.68 0 0)", "--hairline": "oklch(1 0 0 / 11%)",
      "--accent-c": "oklch(0.62 0.23 25)", "--accent-fg": "oklch(0.99 0 0)",
      "--positive": "oklch(0.82 0.15 150)", "--negative": "oklch(0.8 0.15 70)",
    },
  },
  {
    id: "mint",
    name: "3. Mint on deep teal ink",
    note: "A green-forward money palette on a blue-green canvas. Feels like yield without shouting. The risk is looking like every other DeFi dashboard.",
    accent: "Mint 165",
    vars: {
      "--background": "oklch(0.145 0.018 220)", "--surface-1": "oklch(0.18 0.02 220)", "--surface-2": "oklch(0.225 0.022 220)", "--surface-3": "oklch(0.275 0.024 218)",
      "--foreground": "oklch(0.96 0.008 200)", "--muted-foreground": "oklch(0.72 0.02 210)", "--hairline": "oklch(1 0 0 / 10%)",
      "--accent-c": "oklch(0.82 0.16 165)", "--accent-fg": "oklch(0.18 0.04 165)",
      "--positive": "oklch(0.86 0.14 150)", "--negative": "oklch(0.72 0.17 20)",
    },
  },
  {
    id: "paper",
    name: "4. Ink on paper, klein blue",
    note: "The light option. Warm paper, near-black text, one deep blue for anything you can act on. The opposite of a crypto dashboard, which is the point for a savings product.",
    accent: "Klein 265",
    vars: {
      "--background": "oklch(0.98 0.004 85)", "--surface-1": "oklch(1 0 0)", "--surface-2": "oklch(0.955 0.005 85)", "--surface-3": "oklch(0.92 0.007 85)",
      "--foreground": "oklch(0.2 0.012 260)", "--muted-foreground": "oklch(0.52 0.014 260)", "--hairline": "oklch(0.2 0.02 260 / 12%)",
      "--accent-c": "oklch(0.48 0.21 265)", "--accent-fg": "oklch(0.99 0 0)",
      "--positive": "oklch(0.52 0.13 160)", "--negative": "oklch(0.55 0.19 25)",
    },
  },
  {
    id: "clay",
    name: "5. Terracotta on bone",
    note: "Light again, but warm: bone paper, a burnt clay accent, ink text. Turkish without the flag, and nothing else in this hackathon will look like it.",
    accent: "Clay 40",
    vars: {
      "--background": "oklch(0.975 0.012 75)", "--surface-1": "oklch(0.995 0.006 75)", "--surface-2": "oklch(0.95 0.014 70)", "--surface-3": "oklch(0.91 0.018 65)",
      "--foreground": "oklch(0.24 0.03 45)", "--muted-foreground": "oklch(0.54 0.03 50)", "--hairline": "oklch(0.3 0.04 45 / 14%)",
      "--accent-c": "oklch(0.55 0.16 40)", "--accent-fg": "oklch(0.99 0.005 75)",
      "--positive": "oklch(0.5 0.12 155)", "--negative": "oklch(0.52 0.19 28)",
    },
  },
];

export default function PalettePage() {
  return (
    <div>
      <div className="mb-10">
        <div className="label mb-3 text-muted-foreground">Colour</div>
        <h1 className="display text-[2.5rem] leading-[1.05]">Pick a palette</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The same hero, buttons, chips and market card in each candidate. Tell me the number and I will set it across the app, light and dark.
        </p>
      </div>
      <div className="flex flex-col gap-10">
        {PALETTES.map((p) => <Sample key={p.id} palette={p} />)}
      </div>
    </div>
  );
}

function Sample({ palette }: { palette: Palette }) {
  const style = palette.vars as CSSProperties;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <h2 className="text-[15px] font-medium">{palette.name}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{palette.note}</p>
        </div>
        <span className="label shrink-0 text-muted-foreground">{palette.accent}</span>
      </div>

      <div style={style} className="overflow-hidden rounded-2xl border" >
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.2fr_20rem] lg:items-start" style={{ background: "var(--background)", color: "var(--foreground)", borderColor: "var(--hairline)" }}>
          <div className="min-w-0">
            <div className="label mb-4" style={{ color: "var(--muted-foreground)" }}>Koul · conditional execution on Stellar</div>
            <h3 className="display-hero text-[2.5rem] sm:text-[3.25rem]">
              Your rules,<br />executed <span style={{ color: "var(--accent-c)" }}>on-chain</span>.
            </h3>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
              Say what should happen to your position and when. Koul stores it as rules on Stellar and runs them from your own wallet.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-[15px] font-medium" style={{ background: "var(--accent-c)", color: "var(--accent-fg)" }}>
                <ScanFace className="size-4" /> Create wallet
              </span>
              <span className="inline-flex min-h-11 items-center rounded-lg border px-5 text-[15px]" style={{ borderColor: "var(--hairline)" }}>How it works</span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Chip style={{ background: "color-mix(in oklab, var(--accent-c) 16%, transparent)", color: "var(--accent-c)" }}>Armed</Chip>
              <Chip style={{ background: "color-mix(in oklab, var(--positive) 16%, transparent)", color: "var(--positive)" }}>Healthy</Chip>
              <Chip style={{ background: "color-mix(in oklab, var(--negative) 16%, transparent)", color: "var(--negative)" }}>Stale price</Chip>
              <Chip style={{ border: "1px solid var(--hairline)", color: "var(--muted-foreground)" }}>Testnet</Chip>
            </div>
          </div>

          <div className="rounded-xl border p-5" style={{ background: "var(--surface-1)", borderColor: "color-mix(in oklab, var(--accent-c) 40%, transparent)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-medium">USDC</div>
                <div className="mono mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>#3 • #2 <span className="font-sans">Secondary hub</span></div>
              </div>
              <div className="flex items-center gap-2">
                <Chip style={{ background: "color-mix(in oklab, var(--accent-c) 16%, transparent)", color: "var(--accent-c)" }}>Pays most</Chip>
                <ArrowUpRight className="size-4" style={{ color: "var(--muted-foreground)" }} />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[2.25rem] leading-none tracking-tight">127.46%</span>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>deposit APY</span>
            </div>
            <dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 text-xs">
              {[["Borrow APY", "161.60%"], ["Supplied", "23.18 USDC"], ["Available", "1.17 USDC"], ["In use", "95%"]].map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt style={{ color: "var(--muted-foreground)" }}>{k}</dt>
                  <dd className="num text-right">{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
              <div className="h-full rounded-full" style={{ width: "95%", background: "var(--accent-c)" }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Chip({ children, style }: { children: React.ReactNode; style: CSSProperties }) {
  return <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium" style={style}>{children}</span>;
}
