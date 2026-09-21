/**
 * The one mock flag. Nothing in the app invents a number; the two things without a data source today (all-time
 * PNL and the balance chart, see docs/internal/ui-feasibility.md) show a dash unless this is on.
 *   NEXT_PUBLIC_MOCK_HISTORY=1
 */
export const MOCK_HISTORY = process.env.NEXT_PUBLIC_MOCK_HISTORY === "1";

export interface HistoryPoint { t: number; v: number }
export interface MockedHistory { series: HistoryPoint[]; pnl: number; pnlPct: number }

/** A plausible line that ends at today's balance, for demos only. Deterministic so it does not jitter on re-render. */
export function mockedHistory(balance: number, days: number, now: number = Date.now()): MockedHistory {
  const points = Math.max(2, Math.min(days, 60));
  const series: HistoryPoint[] = [];
  const start = balance * 0.985;
  for (let i = 0; i < points; i++) {
    const f = i / (points - 1);
    const wobble = Math.sin(i * 1.7) * 0.004 + Math.cos(i * 0.9) * 0.003;
    series.push({ t: now - (points - 1 - i) * 86_400_000, v: start + (balance - start) * f + balance * wobble });
  }
  series[series.length - 1] = { t: now, v: balance };
  const pnl = balance - start;
  return { series, pnl, pnlPct: start > 0 ? (pnl / start) * 100 : 0 };
}
