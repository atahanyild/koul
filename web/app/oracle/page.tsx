"use client";

/**
 * Demo control panel for the mock FX oracle. The operator moves USD/TRY here and every screen (and the next keeper
 * tick) reacts within seconds. Out of the user flow on purpose.
 */
import { useCallback, useEffect, useState } from "react";
import { TriangleAlert, Check, LoaderCircle } from "lucide-react";
import { KOUL, tryPerUsdToUsdPerTry, usdPerTryToTryPerUsd } from "@/lib/koul";
import { PageHeader, Card, Pill, Address, TxLink, AnimatedNumber, Sk, Term, Row } from "@/components/koul/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDuration, fmtFx } from "@/lib/format";

interface Reading { oracle: string; admin: string | null; price: string | null; timestamp: number | null; now: number }

const STALE_AFTER = 900;

export default function OracleAdmin() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  const refresh = useCallback(async () => {
    const r = (await (await fetch("/api/oracle", { cache: "no-store" })).json()) as Reading;
    setReading(r);
    if (r.price && !input) setInput(usdPerTryToTryPerUsd(BigInt(r.price)).toFixed(2));
  }, [input]);
  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); return () => clearInterval(t); }, [refresh]);

  async function set(tryPerUsd: number, stale = false) {
    setBusy(true); setMsg({});
    try {
      const body: Record<string, unknown> = { price: tryPerUsdToUsdPerTry(tryPerUsd).toString() };
      if (stale) body.timestamp = Math.floor(Date.now() / 1000) - 3600;
      const r = (await (await fetch("/api/oracle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) as { hash?: string; status?: string; error?: string };
      if (r.error) throw new Error(r.error);
      setMsg({ ok: `${r.status} ${r.hash}` });
      setInput(tryPerUsd.toFixed(2));
    } catch (err) { setMsg({ err: err instanceof Error ? err.message : String(err) }); }
    finally { setBusy(false); await refresh(); }
  }

  const current = reading?.price ? usdPerTryToTryPerUsd(BigInt(reading.price)) : null;
  const age = reading?.timestamp ? reading.now - reading.timestamp : null;
  const stale = age !== null && age > STALE_AFTER;
  const okStatus = msg.ok?.split(" ")[0];
  const okHash = msg.ok?.split(" ")[1];

  return (
    <>
      <PageHeader
        eyebrow="Demo controls"
        title="USD/TRY mock oracle"
        description={<>Testnet stand-in for <Term detail="Reflector-shaped oracle: lastprice(TRY) returns USD per TRY with 14 decimals and a unix timestamp">Reflector</Term>, with the same read interface. The router reads it on every tick and rejects a price older than the user&apos;s limit.</>}
        chips={<Pill tone="outline">Operator only</Pill>}
      />

      <div role="note" className="mb-6 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 p-4 text-sm sm:mb-8">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p><span className="font-medium">This is the operator&apos;s panel.</span> <span className="text-muted-foreground">It sits outside the user flow and the audience never sees it. Move the price here and every screen follows within ten seconds; the next keeper tick acts on it.</span></p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:gap-6">
        {/* ------------------------------------------------ the reading */}
        <Card className="flex flex-col">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">USD/TRY now</div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {current === null ? (
              <Sk className="h-12 w-44" />
            ) : (
              <AnimatedNumber value={current} format={fmtFx} className="text-[2.75rem] leading-none tracking-tight sm:text-[3.25rem]" aria-live="polite" />
            )}
            <span className="text-sm text-muted-foreground">lira per dollar</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {age === null ? (
              <Sk className="h-6 w-28 rounded-full" />
            ) : (
              <Pill tone={stale ? "warning" : "positive"} dot pulse={!stale}>
                {stale ? "Stale" : "Fresh"}<span className="num">{fmtDuration(age)} old</span>
              </Pill>
            )}
            <Term detail={`Router rules carry max_price_age_secs = ${STALE_AFTER}. Older prices make tick() fail with error 7204 (price stale).`} className="text-xs text-muted-foreground">
              {stale ? `older than the ${STALE_AFTER} s limit, rules will not run` : `under the ${STALE_AFTER} s limit`}
            </Term>
          </div>

          <div className="mt-6 divide-y divide-border border-t border-border">
            <Row label={<Term detail="lastprice(TRY).price as an i128, USD per TRY with 14 decimals">Raw price</Term>}>
              {reading?.price ? <span className="text-xs text-muted-foreground sm:text-sm">{reading.price}</span> : <Sk className="inline-block h-4 w-32 align-middle" />}
            </Row>
            <Row label="Oracle contract"><Address value={KOUL.oracle} label="oracle contract" /></Row>
            <Row label="Admin key">
              {reading === null ? <Sk className="inline-block h-4 w-28 align-middle" /> : reading.admin ? <Address value={reading.admin} label="admin key" /> : <span className="font-sans text-xs text-negative">ORACLE_ADMIN_SECRET is not set</span>}
            </Row>
          </div>
        </Card>

        {/* ------------------------------------------------ the controls */}
        <Card className="flex flex-col">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Set the price</div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => { e.preventDefault(); void set(Number(input)); }}
          >
            <label className="sr-only" htmlFor="oracle-price">USD/TRY</label>
            <Input
              id="oracle-price"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="48.79"
              className="num h-11 min-h-11 flex-1 text-lg"
              disabled={busy}
            />
            <Button type="submit" size="lg" className="min-h-11 shrink-0 px-4 text-[15px]" disabled={busy || !input}>
              {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
              Set price
            </Button>
          </form>

          <div className="mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Presets</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Button variant="outline" size="lg" className="h-auto min-h-11 flex-col items-start gap-0.5 px-3.5 py-2.5 sm:items-center" disabled={busy} onClick={() => void set(48.79)}>
              <span className="num text-base leading-tight">48.79</span>
              <span className="text-[11px] font-normal text-muted-foreground">Calm, nothing runs</span>
            </Button>
            <Button variant="outline" size="lg" className="h-auto min-h-11 flex-col items-start gap-0.5 px-3.5 py-2.5 sm:items-center" disabled={busy} onClick={() => void set(50.25)}>
              <span className="num text-base leading-tight">50.25</span>
              <span className="text-[11px] font-normal text-muted-foreground">Lira shock, exit at <span className="num">50</span> fires</span>
            </Button>
            <Button variant="outline" size="lg" className="h-auto min-h-11 flex-col items-start gap-0.5 px-3.5 py-2.5 sm:items-center" disabled={busy} onClick={() => void set(Number(input) || 48.79, true)}>
              <span className="text-base leading-tight">Publish stale</span>
              <span className="text-[11px] font-normal text-muted-foreground">Same price, <span className="num">1</span> h old</span>
            </Button>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">On stage</div>
            <ol className="mt-2 grid gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
              <li className="flex gap-2.5"><span className="num shrink-0 text-muted-foreground/60">1</span><span>At <span className="num text-foreground">48.79</span> Lira shield says nothing would run. Show the portfolio, the rules, the activity.</span></li>
              <li className="flex gap-2.5"><span className="num shrink-0 text-muted-foreground/60">2</span><span>Set <span className="num text-foreground">50.25</span>. Within ten seconds rule <span className="num">3</span> lights up on every screen; the next keeper tick withdraws <span className="num">120.00</span> USDC to the wallet and a run lands in Activity.</span></li>
              <li className="flex gap-2.5"><span className="num shrink-0 text-muted-foreground/60">3</span><span>Publish stale to show the safety: the router refuses an old price and nothing moves.</span></li>
            </ol>
          </div>

          <div className="mt-4 min-h-6 text-sm" aria-live="polite">
            {busy && (
              <span className="inline-flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Publishing to the oracle, a few seconds</span>
            )}
            {!busy && okStatus && okHash && (
              <span className="inline-flex flex-wrap items-center gap-2 text-positive">
                <Check className="size-4" aria-hidden />
                <span>Published, <span className="num">{okStatus}</span></span>
                <TxLink hash={okHash} className="text-positive/80 hover:text-positive" />
              </span>
            )}
            {!busy && msg.err && <span role="alert" className="text-negative">{msg.err}</span>}
          </div>
        </Card>
      </div>
    </>
  );
}
