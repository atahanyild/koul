"use client";

/**
 * Funds: everything that moves money in or out of the wallet. Four actions, the active flow beside them on
 * desktop or in a bottom sheet on phones, the rate, and every past transfer. The lira deposit timeline is the
 * live demo moment: every step has a state and the waiting step counts.
 */
import * as React from "react";
import { DemoChip, Money, PageHeader, Section, Sk } from "@/components/koul/primitives";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { RequireWallet } from "@/components/shell/connect-panel";
import { useWallet } from "@/hooks/use-wallet";
import { ActionGrid, FLOW_META, FlowPanel, type FlowKind } from "@/components/funds/flow-host";
import { DepositFlow } from "@/components/funds/deposit-flow";
import { WithdrawFlow } from "@/components/funds/withdraw-flow";
import { ReceiveCrypto } from "@/components/funds/receive-crypto";
import { SendCrypto } from "@/components/funds/send-crypto";
import { HistoryAside, TransferHistory, useTransferHistory } from "@/components/funds/history";
import { RateCard, RateStrip } from "@/components/funds/rate-card";
import { useMediaQuery } from "@/components/funds/use-funds";

const SAMPLE = { usdc: 30, xlm: 412.5 };

export default function FundsPage() {
  const w = useWallet();
  const history = useTransferHistory();
  const inline = useMediaQuery("(min-width: 1024px)");
  const [flow, setFlow] = React.useState<FlowKind>("deposit");
  const [open, setOpen] = React.useState(false);
  const [locked, setLocked] = React.useState(false);

  const pick = React.useCallback((k: FlowKind) => {
    if (locked) return;
    setFlow(k);
    setOpen(true);
  }, [locked]);
  const close = React.useCallback(() => { setOpen(false); setLocked(false); }, []);
  const onLockedChange = React.useCallback((l: boolean) => setLocked(l), []);

  const usdc = w.isConnected ? w.usdc : SAMPLE.usdc;
  const xlm = w.isConnected ? w.xlm : SAMPLE.xlm;
  const meta = FLOW_META[flow];
  const flowProps = { onLockedChange, onClose: close };
  const body = open ? (
    flow === "deposit" ? <DepositFlow {...flowProps} />
    : flow === "withdraw" ? <WithdrawFlow {...flowProps} />
    : flow === "receive" ? <ReceiveCrypto />
    : <SendCrypto {...flowProps} />
  ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Funds"
        title="Move money in and out"
        actions={
          <div className="flex items-end gap-5 sm:gap-6">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">In your wallet</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                {usdc === null ? <Sk className="h-8 w-32" /> : <Money value={usdc} size="lg" />}
                {xlm === null ? <Sk className="h-5 w-20" /> : <Money value={xlm} currency="XLM" size="sm" className="text-muted-foreground" />}
              </div>
            </div>
            {!w.isConnected && !w.initializing && <DemoChip className="mb-1" />}
          </div>
        }
      />

      <RequireWallet connected={w.isConnected} initializing={w.initializing}>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
          <div className="min-w-0">
            <Section>
              <ActionGrid active={open ? flow : null} locked={locked} onPick={pick} />
            </Section>
            <RateStrip className="-mt-4 mb-8 lg:hidden" />
            <Section title="History" aside={<HistoryAside source={history.source} loading={history.loading} />}>
              <TransferHistory onDeposit={() => pick("deposit")} />
            </Section>
          </div>
          <aside className="hidden lg:sticky lg:top-10 lg:block">
            {open && inline ? <FlowPanel key={flow} kind={flow} locked={locked} onClose={close}>{body}</FlowPanel> : <RateCard />}
          </aside>
        </div>
        <ResponsiveSheet open={open && !inline} onOpenChange={(o) => { if (!o) close(); }} locked={locked} title={meta.title} description={meta.description}>
          <div className="pt-1 pb-2" key={flow}>{body}</div>
        </ResponsiveSheet>
      </RequireWallet>
    </>
  );
}
