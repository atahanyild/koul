"use client";

/**
 * The demo runner: three presses that move the mock USD/TRY price (calm, a lira shock, a stale publish) and a
 * countdown to the keeper's next pass. Renders only with NEXT_PUBLIC_KOUL_DEMO=1 on testnet; the price change goes
 * through a server route, the browser holds no secret.
 */
import * as React from "react";
import { toast } from "sonner";
import { KeyValue, Label, PillButton, Tile, TileLabel } from "@/components/signal";
import { toastTx } from "@/hooks/use-passkey-action";
import { useFx } from "@/hooks/use-market";
import { invalidate } from "@/lib/data/store";
import { fmtFx } from "@/lib/format";
import { KOUL } from "@/lib/koul";

export const DEMO_ON = process.env.NEXT_PUBLIC_KOUL_DEMO === "1" && KOUL.networkPassphrase === "Test SDF Network ; September 2015";
/** The keeper's cron: every five minutes on the clock. */
const KEEPER_PERIOD_S = 300;

const PRESETS: { label: string; tryPerUsd: number; stale?: boolean }[] = [
  { label: "Calm 48.79", tryPerUsd: 48.79 },
  { label: "Lira shock 50.25", tryPerUsd: 50.25 },
  { label: "Publish stale", tryPerUsd: 48.79, stale: true },
];

function useSecond(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

export function DemoSection() {
  const fx = useFx();
  const now = useSecond();
  const [busy, setBusy] = React.useState<string | null>(null);
  const left = KEEPER_PERIOD_S - Math.floor(now / 1000) % KEEPER_PERIOD_S;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const press = async (p: (typeof PRESETS)[number]) => {
    setBusy(p.label);
    try {
      const r = await fetch("/api/demo/oracle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tryPerUsd: p.tryPerUsd, stale: p.stale }) });
      const j = (await r.json()) as { hash?: string; error?: string };
      if (!r.ok || !j.hash) throw new Error(j.error ?? `HTTP ${r.status}`);
      toastTx(p.stale ? "Stale price published" : `USD/TRY set to ${fmtFx(p.tryPerUsd)}`, j.hash, p.stale ? "Rules that read USD/TRY see no reading until the keeper republishes." : `The keeper checks in ${mm}:${ss}.`);
      invalidate("fx"); invalidate("check:"); invalidate("tick:");
      await fx.refresh();
    } catch (e) {
      toast.error("The oracle did not move", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Tile className="grid gap-4">
      <div className="flex items-baseline justify-between gap-3"><TileLabel>Demo</TileLabel><Label>Testnet only</Label></div>
      <div className="divide-y divide-line">
        <KeyValue label="USD/TRY now" value={fx.fx.tryPerUsd > 0 ? `${fmtFx(fx.fx.tryPerUsd)}${fx.fx.stale ? " · STALE" : ""}` : "NO READING"} tone={fx.fx.stale ? "dim" : "text"} />
        <KeyValue label="Next keeper pass" value={`${mm}:${ss}`} tone="lime" />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => <PillButton key={p.label} variant={p.stale ? "outline" : "lime"} size="md" onClick={() => void press(p)} disabled={busy !== null} aria-busy={busy === p.label}>{busy === p.label ? "Publishing" : p.label}</PillButton>)}
      </div>
      <Label>Moves the mock oracle. Watch the Home autopilot tile: the marker slides to the rule that ran and a toast links the transaction.</Label>
    </Tile>
  );
}
