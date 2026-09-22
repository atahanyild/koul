"use client";

/**
 * Account: the wallet address with copy, Deposit and Withdraw, the assets list, and the sign-in tile with the
 * network, test XLM, the theme switch and Disconnect.
 */
import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { toastTx } from "@/hooks/use-passkey-action";
import { Switch } from "@/components/ui/switch";
import { CopyAction, KeyValue, Label, Loadable, PillButton, Row, RowList, Sk, SkRows, Tile, TileLabel } from "@/components/signal";
import { useWallet } from "@/hooks/use-wallet";
import { usePortfolio } from "@/hooks/use-portfolio";
import { fmtUsdc } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEMO_ON, DemoSection } from "@/components/account/demo";

export default function AccountPage() {
  const w = useWallet();
  const pf = usePortfolio();
  const { resolvedTheme, setTheme } = useTheme();
  const [funding, setFunding] = React.useState(false);
  const address = w.address ?? "";
  const shortAddress = address ? `${address.slice(0, 8)}…${address.slice(-8)}` : "";
  const supplied = pf.positions.supplied.A + pf.positions.supplied.B;
  const debt = pf.positions.borrowed.A + pf.positions.borrowed.B;
  // `resolvedTheme` is undefined until next-themes has read the stored choice, on the server and on first paint
  // alike; until the page is mounted the switch stays still instead of sliding into place.
  const mounted = React.useSyncExternalStore(() => () => {}, () => true, () => false);
  const light = mounted && resolvedTheme === "light";
  /** The colours cross-fade: the transition class stays on <html> just long enough for the change. */
  const switchTheme = (next: "light" | "dark") => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    setTheme(next);
    window.setTimeout(() => root.classList.remove("theme-fade"), 300);
  };

  const fund = async () => {
    setFunding(true);
    try {
      const r = await w.fund();
      if (r.success && r.hash) toastTx("Test XLM added", r.hash, "Friendbot topped up this wallet.");
      else if (r.success) toast("Friendbot answered", { description: "No transaction hash came back; check the XLM row." });
      else toast.error("Friendbot declined", { description: "This wallet may already be funded." });
    } catch (e) {
      toast.error("Could not add test XLM", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setFunding(false);
      await w.refetchBalances();
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-5">
      <div className="grid gap-4 md:gap-5">
        <Tile className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <TileLabel>Your wallet</TileLabel>
            <div className="mt-3 flex items-center gap-3">
              {address ? <span className="mono truncate text-[20px] md:text-[22px]" title={address}>{shortAddress}</span> : <Sk className="h-6 w-56" />}
              {address && <CopyAction value={address} label="Copy address" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <PillButton variant="outline" size="lg" href="/withdraw" disabled={pf.loaded && supplied + pf.positions.idleUsdc - debt <= 0}>Withdraw</PillButton>
            <PillButton size="lg" href="/deposit">Deposit</PillButton>
          </div>
        </Tile>
        {DEMO_ON && <DemoSection />}
        <Tile>
          <TileLabel>Assets</TileLabel>
          <Loadable loading={!pf.loaded} skeleton={<SkRows rows={3} />} className="mt-2">
            <RowList>
              <Row title="USDC" sub="In XOXNO · earning" value={fmtUsdc(supplied)} />
              {debt > 0 && <Row title="USDC" sub="In XOXNO · debt" value={`−${fmtUsdc(debt)}`} />}
              <Row title="USDC" sub="In wallet · idle" value={fmtUsdc(pf.positions.idleUsdc)} />
              <Row title="XLM" sub="In wallet · testnet" value={fmtUsdc(w.xlm ?? pf.positions.idleXlm)} />
            </RowList>
          </Loadable>
        </Tile>
      </div>
      <Tile className="flex flex-col gap-2 md:self-start">
        <TileLabel>Sign in</TileLabel>
        <div className="mt-2 divide-y divide-line">
          <KeyValue label="Method" value="PASSKEY" />
          <KeyValue label="Network" value="TESTNET" />
          <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2">
            <Label>Light theme</Label>
            <Switch checked={light} onCheckedChange={(v) => switchTheme(v ? "light" : "dark")} aria-label="Light theme" disabled={!mounted} className={cn(!mounted && "[&_*]:!transition-none")} />
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          <PillButton variant="ghost" size="lg" full onClick={() => void fund()} disabled={funding} aria-busy={funding}>{funding ? "Asking friendbot" : "Get test XLM"}</PillButton>
          <PillButton variant="outline" size="lg" full onClick={() => void w.disconnect()}>Disconnect</PillButton>
        </div>
      </Tile>
    </div>
  );
}
