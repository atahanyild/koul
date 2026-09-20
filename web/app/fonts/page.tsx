/**
 * A throwaway page to choose the typefaces: the same hero, the same market card and the same address, rendered in
 * each candidate pairing. Every block overrides --font-sans, --font-serif and --font-mono, so what you see is what
 * the app would look like. Delete this route once a pairing is picked.
 */
import { Bricolage_Grotesque, Fraunces, Geist, Geist_Mono, IBM_Plex_Mono, Instrument_Serif, Inter, Inter_Tight, Newsreader } from "next/font/google";
import type { CSSProperties } from "react";

const geist = Geist({ subsets: ["latin"], variable: "--f-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--f-geist-mono", display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--f-instrument", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--f-fraunces", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--f-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--f-inter-tight", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--f-newsreader", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-plex-mono", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-bricolage", display: "swap" });

const ALL = [geist, geistMono, instrument, fraunces, inter, interTight, newsreader, plexMono, bricolage].map((f) => f.variable).join(" ");

interface Option {
  id: string;
  name: string;
  note: string;
  display: string;
  sans: string;
  /** What numbers are set in. */
  numbers: string;
  vars: CSSProperties;
}

const OPTIONS: Option[] = [
  {
    id: "a",
    name: "A. What is on the site now",
    note: "Instrument Serif headlines, Geist everywhere else, Geist Mono for every number. The numbers read like a terminal.",
    display: "Instrument Serif",
    sans: "Geist",
    numbers: "Geist Mono",
    vars: { "--font-serif": "var(--f-instrument)", "--font-sans": "var(--f-geist)", "--font-mono": "var(--f-geist-mono)" } as CSSProperties,
  },
  {
    id: "b",
    name: "B. Editorial",
    note: "Fraunces headlines, which have real contrast and a proper italic, with Inter for the interface. Numbers in Inter with tabular figures, so they line up without looking like code.",
    display: "Fraunces",
    sans: "Inter",
    numbers: "Inter, tabular",
    vars: { "--font-serif": "var(--f-fraunces)", "--font-sans": "var(--f-inter)", "--font-mono": "var(--f-inter)" } as CSSProperties,
  },
  {
    id: "c",
    name: "C. Financial press",
    note: "Newsreader headlines, sober and readable, with Inter Tight for the interface. IBM Plex Mono kept for addresses and hashes only.",
    display: "Newsreader",
    sans: "Inter Tight",
    numbers: "Inter Tight, tabular",
    vars: { "--font-serif": "var(--f-newsreader)", "--font-sans": "var(--f-inter-tight)", "--font-mono": "var(--f-inter-tight)" } as CSSProperties,
  },
  {
    id: "d",
    name: "D. No serif at all",
    note: "Bricolage Grotesque headlines against Inter. One modern voice, no editorial flourish. Numbers in Inter, tabular.",
    display: "Bricolage Grotesque",
    sans: "Inter",
    numbers: "Inter, tabular",
    vars: { "--font-serif": "var(--f-bricolage)", "--font-sans": "var(--f-inter)", "--font-mono": "var(--f-inter)" } as CSSProperties,
  },
];

export default function FontsPage() {
  return (
    <div className={ALL}>
      <div className="mb-10">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Type</div>
        <h1 className="display text-[2.5rem] leading-[1.05] tracking-tight">Pick a pairing</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          The same hero, the same market card and the same wallet address in each candidate. Tell me the letter and I will set it everywhere.
        </p>
      </div>
      <div className="flex flex-col gap-12">
        {OPTIONS.map((o) => <Sample key={o.id} option={o} />)}
      </div>
    </div>
  );
}

function Sample({ option }: { option: Option }) {
  return (
    <section style={option.vars} className="border-t border-border pt-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="font-sans text-[15px] font-medium">{option.name}</h2>
          <p className="mt-1 max-w-2xl font-sans text-sm leading-relaxed text-muted-foreground">{option.note}</p>
        </div>
        <dl className="flex shrink-0 gap-x-6 font-sans text-xs text-muted-foreground">
          <div><dt className="opacity-70">Headlines</dt><dd className="text-foreground">{option.display}</dd></div>
          <div><dt className="opacity-70">Interface</dt><dd className="text-foreground">{option.sans}</dd></div>
          <div><dt className="opacity-70">Numbers</dt><dd className="text-foreground">{option.numbers}</dd></div>
        </dl>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_20rem] lg:items-start">
        <div className="min-w-0">
          <div className="mb-3 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Koul · conditional execution on Stellar</div>
          <h3 className="display text-[2.75rem] leading-[1.02] tracking-tight sm:text-[3.25rem]">
            Your rules, executed <em className="display-italic">on-chain</em>.
          </h3>
          <p className="mt-4 max-w-md font-sans text-base leading-relaxed text-muted-foreground">
            Say what should happen to your position and when. Koul stores it as rules on Stellar and runs them against XOXNO lending from your own wallet.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 font-sans">
            <span className="inline-flex min-h-11 items-center rounded-lg bg-saffron px-5 text-[15px] font-medium text-saffron-foreground">Create wallet</span>
            <span className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-[15px]">How it works</span>
          </div>
          <p className="mt-5 font-sans text-sm text-muted-foreground">
            Wallet <span className="num text-foreground">CBHMG4IG…L3Y7UUFL</span> · health factor <span className="num text-foreground">1.18</span> · rule fired <span className="num text-foreground">12</span> minutes ago
          </p>
        </div>

        <div className="rounded-xl border border-saffron/40 bg-card p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-sans text-[15px] font-medium">USDC</div>
              <div className="num mt-1 flex items-center gap-2 text-xs text-muted-foreground">#3 • #2 <span className="font-sans">Secondary hub</span></div>
            </div>
            <span className="rounded-full bg-saffron-soft px-2 py-0.5 font-sans text-[11px] font-medium text-saffron">Pays most</span>
          </div>
          <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-[2.25rem] leading-none tracking-tight">127.46%</span>
            <span className="font-sans text-sm text-muted-foreground">deposit APY</span>
          </div>
          <dl className="mt-5 grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 font-sans text-xs">
            <dt className="text-muted-foreground">Borrow APY</dt>
            <dd className="num text-right">161.60%</dd>
            <dt className="text-muted-foreground">Supplied</dt>
            <dd className="num text-right">23.18 USDC</dd>
            <dt className="text-muted-foreground">Available</dt>
            <dd className="num text-right">1.17 USDC</dd>
            <dt className="text-muted-foreground">In use</dt>
            <dd className="num text-right">95%</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
