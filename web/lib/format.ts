/** Formatting helpers. Every number the user sees goes through Intl. */

const USDC_DECIMALS = 7;
export const USDC_UNIT = 10_000_000n;

const usdcFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdcCompact = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const tryFormatter = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tryWhole = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fxFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "1,234.56" — the amount only, caller adds the unit. */
export const fmtUsdc = (n: number) => usdcFormatter.format(n);
/** "1,234.5" — loose form for headlines and pills. */
export const fmtUsdcLoose = (n: number) => usdcCompact.format(n);
/** "₺7.318,50" in Turkish locale conventions. */
export const fmtTry = (n: number) => tryFormatter.format(n);
export const fmtTryWhole = (n: number) => tryWhole.format(n);
/** "5.56%" */
export const fmtPct = (n: number) => `${pctFormatter.format(n)}%`;
/** "4.21 pts" — a difference between two percentages. */
export const fmtPts = (n: number) => `${pctFormatter.format(n)} pts`;
/** "48.79" — TRY per USD as people read it. */
export const fmtFx = (n: number) => fxFormatter.format(n);
export const fmtInt = (n: number) => intFormatter.format(n);
/** "2.74" or "∞" for the health factor. */
export const fmtHealth = (n: number | null) => (n === null || !Number.isFinite(n) ? "∞" : pctFormatter.format(n));

/** Stroops / 7-decimal integer -> number. */
export const fromUnits = (raw: bigint, decimals = USDC_DECIMALS) => Number(raw) / 10 ** decimals;
export const toUnits = (n: number, decimals = USDC_DECIMALS) => BigInt(Math.round(n * 10 ** decimals));

export const shortAddress = (a: string, head = 6, tail = 4) => (a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`);
export const shortHash = (h: string) => `${h.slice(0, 8)}…`;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

/** "12 min ago", "2 h ago", "yesterday". */
export function fmtRelative(date: Date | number, now: number = Date.now()): string {
  const t = typeof date === "number" ? date : date.getTime();
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return diff <= 0 ? "just now" : "in a moment";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute").replace("min.", "min");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour").replace("hr.", "h");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** "6 h 20 min" or "3 d 4 h" for durations in seconds. */
export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Short cooldown labels for rule cards: "5 s", "30 min", "1 h", "24 h", "2 d". */
export function fmtCooldown(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds % 86400 === 0 && seconds >= 86400) return `${seconds / 86400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${Math.round(seconds / 60)} min`;
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtTime = (d: Date | number) => timeFormatter.format(d);
export const fmtDate = (d: Date | number) => dateFormatter.format(d);
export const fmtDateTime = (d: Date | number) => dateTimeFormatter.format(d);

/** Ledgers are ~5 s apart on testnet. */
export const LEDGER_SECONDS = 5;
export const ledgersToSeconds = (ledgers: number) => ledgers * LEDGER_SECONDS;
