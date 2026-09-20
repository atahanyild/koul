"use client";

/**
 * Where the USDC sits: a table on desktop, cards on phones. Supply and withdraw open a sheet with an amount and a
 * passkey button that signs the XOXNO controller call and submits it.
 */
import * as React from "react";
import Link from "next/link";
import { Section, Card, Money, Term, Pill, Sk, AnimatedNumber } from "@/components/koul/primitives";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { PasskeyButton, PasskeyHint } from "@/components/koul/passkey-button";
import { usePositionActions, toUsdcUnits, fromUsdcUnits, snapWithdrawUnits } from "@/hooks/use-position-actions";
import type { Pool, Positions } from "@/lib/data/types";
import type { Autopilot } from "@/lib/model/autopilot";
import { fmtPct, fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mode = "supply" | "withdraw";
interface SheetState { pool: Pool; mode: Mode }

export function PositionsSection({ positions, pools, poolsLoading, managedBy }: { positions: Positions; pools: Pool[]; poolsLoading: boolean; managedBy: Autopilot | null }) {
  const [sheet, setSheet] = React.useState<SheetState | null>(null);
  const [open, setOpen] = React.useState(false);
  const openSheet = (pool: Pool, mode: Mode) => { setSheet({ pool, mode }); setOpen(true); };

  const managed = managedBy ? (
    <Link href={`/autopilots/${managedBy.id}`} className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Managed by ${managedBy.name}, open autopilot`}>
      <Pill tone="saffron" dot>{managedBy.name}</Pill>
    </Link>
  ) : (
    <span className="text-muted-foreground" aria-label="Not managed by an autopilot">—</span>
  );

  return (
    <Section title="Positions" description="Your USDC in each pool and who is looking after it.">
      {/* Desktop: a table */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-5 text-xs font-medium text-muted-foreground">Pool</TableHead>
              <TableHead className="px-4 text-right text-xs font-medium text-muted-foreground">Supplied</TableHead>
              <TableHead className="px-4 text-right text-xs font-medium text-muted-foreground">Rate</TableHead>
              <TableHead className="px-4 text-xs font-medium text-muted-foreground">Managed by</TableHead>
              <TableHead className="px-5 text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pools.map((p) => {
              const supplied = positions.supplied[p.id];
              return (
                <TableRow key={p.id} className={cn(supplied <= 0 && "text-muted-foreground")}>
                  <TableCell className="px-5 py-4 text-sm font-medium text-foreground"><Term detail={p.technical}>{p.name}</Term></TableCell>
                  <TableCell className="px-4 py-4 text-right"><Money value={supplied} size="md" className={cn(supplied <= 0 && "text-muted-foreground")} /></TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    {poolsLoading ? <Sk className="ml-auto h-4 w-16" /> : <><AnimatedNumber value={p.supplyApy} format={fmtPct} className="text-foreground" /> <span className="text-xs text-muted-foreground">a year</span></>}
                  </TableCell>
                  <TableCell className="px-4 py-4">{managed}</TableCell>
                  <TableCell className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="min-h-9 px-3" onClick={() => openSheet(p, "supply")}>Supply</Button>
                      <Button variant="ghost" size="sm" className="min-h-9 px-3" disabled={supplied <= 0} onClick={() => openSheet(p, "withdraw")}>Withdraw</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Phones: cards */}
      <div className="grid gap-3 md:hidden">
        {pools.map((p) => {
          const supplied = positions.supplied[p.id];
          return (
            <Card key={p.id} className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium"><Term detail={p.technical}>{p.name}</Term></div>
                {managed}
              </div>
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Money value={supplied} size="lg" className={cn(supplied <= 0 && "text-muted-foreground")} />
                <span className="text-sm text-muted-foreground">
                  {poolsLoading ? <Sk className="inline-block h-4 w-16 align-middle" /> : <><AnimatedNumber value={p.supplyApy} format={fmtPct} className="text-foreground" /> a year</>}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="outline" size="lg" className="min-h-11" onClick={() => openSheet(p, "supply")}>Supply</Button>
                <Button variant="outline" size="lg" className="min-h-11" disabled={supplied <= 0} onClick={() => openSheet(p, "withdraw")}>Withdraw</Button>
              </div>
            </Card>
          );
        })}
      </div>

      <PositionSheet state={sheet} open={open} onOpenChange={setOpen} idle={positions.idleUsdc} supplied={sheet ? positions.supplied[sheet.pool.id] : 0} />
    </Section>
  );
}

export function PositionsSkeleton() {
  return (
    <Section title="Positions">
      <div className="grid gap-3 md:hidden" aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <Sk className="mb-3 h-3 w-14" />
            <Sk className="mb-4 h-7 w-32" />
            <div className="grid grid-cols-2 gap-2"><Sk className="h-11" /><Sk className="h-11" /></div>
          </div>
        ))}
      </div>
      <div className="hidden rounded-xl border border-border bg-card md:block" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("flex items-center gap-6 px-5 py-4", i > 0 && "border-t border-border")}>
            <Sk className="h-4 w-16" /><Sk className="ml-auto h-4 w-24" /><Sk className="h-4 w-16" /><Sk className="h-5 w-24 rounded-full" /><Sk className="h-8 w-36" />
          </div>
        ))}
      </div>
    </Section>
  );
}

const parseAmount = (t: string) => {
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function PositionSheet({ state, open, onOpenChange, idle, supplied }: { state: SheetState | null; open: boolean; onOpenChange: (o: boolean) => void; idle: number; supplied: number }) {
  const [text, setText] = React.useState("");
  const { supply, withdraw, action, ready } = usePositionActions();
  const { reset } = action;
  React.useEffect(() => { if (open) { setText(""); reset(); } }, [open, state, reset]);

  const pool = state?.pool;
  const mode = state?.mode ?? "supply";
  const max = mode === "supply" ? idle : supplied;
  const amount = parseAmount(text);
  // Withdrawals go out rounded down to the cent; the button and the title show what will actually be signed.
  const signedAmount = mode === "withdraw" ? fromUsdcUnits(snapWithdrawUnits(toUsdcUnits(amount))) : amount;
  const valid = signedAmount > 0 && amount <= max + 1e-7;
  const rate = pool?.supplyApy ?? 0;
  const verb = mode === "supply" ? "Supply" : "Withdraw";
  const busy = action.busy;

  const submit = async () => {
    if (!pool || !valid || busy) return;
    const res = mode === "supply" ? await supply(pool.id, signedAmount) : await withdraw(pool.id, signedAmount);
    if (res) { setText(""); onOpenChange(false); }
  };

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(o) => { if (!busy) onOpenChange(o); }}
      title={pool ? (mode === "supply" ? `Supply to ${pool.name}` : `Withdraw from ${pool.name}`) : verb}
      description={mode === "supply" ? `Earns ${fmtPct(rate)} a year from the moment it lands. Withdraw whenever you like.` : "Back to your wallet in one transaction."}
      width="md:max-w-[460px]"
      footer={
        <div className="flex flex-col gap-3">
          <PasskeyHint phase={action.phase} error={action.error} />
          <PasskeyButton phase={action.phase} className="w-full" disabled={!valid || !ready} onClick={() => void submit()}>
            {verb}{valid ? ` ${fmtUsdc(signedAmount)} USDC` : ""}
          </PasskeyButton>
        </div>
      }
    >
      <label htmlFor="position-amount" className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Amount</label>
      <div className="mt-2 flex items-baseline gap-2 border-b border-border pb-2 transition-colors focus-within:border-foreground/40">
        <input
          id="position-amount"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="0.00"
          disabled={busy}
          aria-describedby="position-max"
          aria-invalid={text !== "" && !valid ? true : undefined}
          className="num w-full min-w-0 bg-transparent text-3xl leading-none text-foreground outline-none placeholder:text-muted-foreground/40 disabled:opacity-60"
        />
        <span className="text-sm font-medium tracking-wide text-muted-foreground">USDC</span>
        <button type="button" onClick={() => setText(fmtUsdc(max).replace(/,/g, ""))} disabled={max <= 0 || busy}
          className="num ml-1 inline-flex min-h-9 shrink-0 items-center rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
          Max
        </button>
      </div>
      <p id="position-max" className="mt-2 text-xs text-muted-foreground">
        {mode === "supply" ? <><span className="num">{fmtUsdc(idle)} USDC</span> in your wallet</> : <><span className="num">{fmtUsdc(supplied)} USDC</span> in {pool?.name ?? "this pool"}</>}
        {mode === "withdraw" && <> · rounded down to 0.01 USDC, since the position earns interest every ledger</>}
        {text !== "" && !valid && amount > max && <span className="text-negative"> · more than you have</span>}
      </p>
      {mode === "supply" && (
        <div className="mt-5 flex items-baseline justify-between gap-4 rounded-lg bg-surface-2/70 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Earns about</span>
          <span className="num"><AnimatedNumber value={(Math.max(0, amount) * rate) / 100} /> USDC a year</span>
        </div>
      )}
    </ResponsiveSheet>
  );
}
