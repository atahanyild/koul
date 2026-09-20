"use client";

/**
 * The arm sheet: how long Koul's key stays valid, what it may do, which rules the router cannot run, then one
 * button. Arming is up to three passkey prompts: open the position when the wallet has never supplied, grant the
 * key (skipped when one is already active), then save the rules on the router.
 */
import * as React from "react";
import Link from "next/link";
import { Check, KeyRound, PiggyBank, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "@/components/koul/responsive-sheet";
import { PasskeyButton, PasskeyHint } from "@/components/koul/passkey-button";
import { Term } from "@/components/koul/primitives";
import { useArmAutopilot, type ArmResult } from "@/hooks/use-autopilots";
import { usePortfolio } from "@/hooks/use-portfolio";
import type { ActionPhase } from "@/hooks/use-passkey-action";
import { POOLS, permissionsFor, type Autopilot, type PoolId } from "@/lib/model/autopilot";
import { usePools, bestPool } from "@/hooks/use-market";
import { fmtDuration, fmtUsdc } from "@/lib/format";
import { Segmented } from "@/components/autopilot/segmented";
import { CanList, Notice } from "@/components/autopilot/autopilot-bits";

const DAY_OPTIONS = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

export interface ArmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The autopilot as shown on the page, pending edits included. */
  ap: Autopilot;
  onArmed: (result: Extract<ArmResult, { ok: true }>) => void;
}

type StepState = "done" | "active" | "pending" | "skipped";

function Step({ n, state, title, children }: { n: number; state: StepState; title: string; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-start gap-3", state === "skipped" && "opacity-60")}>
      <span
        className={cn(
          "num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
          state === "done" ? "bg-positive-soft text-positive" : state === "active" ? "bg-clay-soft text-clay" : "bg-surface-2 text-muted-foreground",
        )}
        aria-hidden
      >
        {state === "done" ? <Check className="size-3" /> : n}
      </span>
      <div className="min-w-0">
        <div className={cn("text-sm", state === "active" && "text-clay")}>{title}</div>
        <div className="text-xs text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function ArmSheet({ open, onOpenChange, ap, onArmed }: ArmSheetProps) {
  const armer = useArmAutopilot();
  const pf = usePortfolio();
  const [days, setDays] = React.useState(7);
  const [failure, setFailure] = React.useState<string | null>(null);

  const { grantAction, rulesAction, agent } = armer;
  const resetGrant = grantAction.reset;
  const resetRules = rulesAction.reset;
  React.useEffect(() => {
    if (!open) return;
    resetGrant();
    resetRules();
    setFailure(null);
  }, [open, resetGrant, resetRules]);

  const accountId = pf.accountId;
  const noAccount = !pf.loading && accountId === null;
  // A wallet that never supplied has no XOXNO account. Rather than sending the user away, the first prompt opens the
  // position with the idle USDC already in the wallet, into the pool the rules name or the one paying more today.
  const pools = usePools();
  const idle = pf.positions.idleUsdc;
  const namedPool = ap.rules.find((r) => r.enabled && r.action.pool)?.action.pool;
  const bestId = (bestPool(pools.pools)?.id ?? "B") as PoolId;
  const openPool = POOLS[(namedPool ?? bestId) as PoolId];
  const openUnits = BigInt(Math.floor(idle * 100)) * 100_000n; // floored to the cent, in 7-decimal units
  const canOpen = noAccount && openUnits >= 10_000_000n;
  const preview = React.useMemo(() => armer.preview(ap, accountId ?? 0n), [armer.preview, ap, accountId]);
  const permissions = React.useMemo(() => permissionsFor(ap), [ap]);
  // When the router already holds exactly these rules, arming is only about the key.
  const storedSame = React.useMemo(() => {
    const chainId = Number(ap.id.replace(/^chain-/, ""));
    const stored = armer.chain.list.find((c) => c.id === chainId)?.autopilot;
    return stored !== undefined && JSON.stringify(stored) === JSON.stringify(preview.autopilot);
  }, [ap.id, armer.chain.list, preview.autopilot]);
  const keyActive = agent.active;
  const prompts = (canOpen ? 1 : 0) + (keyActive ? 0 : 1) + (storedSame ? 0 : 1);
  const enabledRules = ap.rules.filter((r) => r.enabled).length;
  const blocked = (noAccount && !canOpen) || pf.loading || preview.errors.length > 0;
  const busy = grantAction.busy || rulesAction.busy || armer.openAction.busy;

  const phase: ActionPhase = rulesAction.phase !== "idle" ? rulesAction.phase : grantAction.phase !== "idle" ? grantAction.phase : armer.openAction.phase;
  const error = rulesAction.phase !== "idle" ? rulesAction.error : grantAction.phase !== "idle" ? grantAction.error : armer.openAction.error;

  const openState: StepState = armer.openAction.phase === "success" ? "done" : armer.openAction.busy ? "active" : "pending";
  const grantState: StepState = keyActive ? "skipped" : grantAction.phase === "success" ? "done" : grantAction.busy ? "active" : "pending";
  const rulesState: StepState = storedSame ? "skipped" : rulesAction.phase === "success" ? "done" : rulesAction.busy ? "active" : "pending";

  const run = async () => {
    if (blocked) return;
    setFailure(null);
    const res = await armer.arm(ap, { days, accountId, openWith: canOpen ? { hub: openPool.hub, units: openUnits } : undefined });
    if (res.ok) { onArmed(res); onOpenChange(false); return; }
    if (res.step === "wallet") setFailure("The wallet is not ready. Reconnect and try again.");
    if (res.step === "account") setFailure("This wallet has no XOXNO position and no USDC to open one with. Bring funds in first.");
    if (res.step === "open") setFailure("The position was not opened, so nothing else was signed. Check your USDC balance and try again.");
    if (res.step === "rules") setFailure("The router rejected these rules. Fix them and try again.");
    if (res.step === "write" && res.grantHash) setFailure("Koul's key was granted, but the rules were not saved. Try again: only the rules step is repeated, no second key is needed.");
  };

  const footer = (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="lg" className="min-h-11" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <PasskeyButton phase={phase} disabled={blocked} onClick={() => void run()}>
          Arm, {prompts} passkey confirmation{prompts === 1 ? "" : "s"}
        </PasskeyButton>
      </div>
      <PasskeyHint phase={phase} error={error} onRetry={() => void run()} />
      {failure && phase !== "prompt" && phase !== "submitting" && <p className="text-xs text-warning" role="status">{failure}</p>}
    </div>
  );

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={`Arm ${ap.name}`} description="Koul gets a key to your wallet that can only do what these rules need." footer={footer} locked={busy} width="md:max-w-[520px]">
      <div className="grid gap-6 pt-1">
        <section className="grid gap-3">
          <h3 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            What the key can do
            {enabledRules > 0 && <span className="num ml-2 normal-case tracking-normal">{enabledRules} rule{enabledRules === 1 ? "" : "s"}</span>}
          </h3>
          {permissions.can.length ? (
            <CanList items={permissions.can} />
          ) : (
            <p className="text-sm text-muted-foreground">No rule is switched on, so there is nothing to allow. Turn a rule on or add one first.</p>
          )}
          <p className="text-xs text-muted-foreground">
            It cannot send funds anywhere else, change these rules, or act after the key expires.{" "}
            <Term detail={<ul className="grid gap-0.5">{permissions.technical.map((t) => <li key={t}>{t}</li>)}</ul>}>Technical</Term>
          </p>
        </section>

        <section className="grid gap-2">
          <h3 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Key valid for</h3>
          {keyActive ? (
            <Notice tone="neutral">
              Koul&apos;s key is already active{keyActive.secondsLeft !== null && <>, valid <span className="num">{fmtDuration(keyActive.secondsLeft)}</span></>}. Only the rules are saved; no new key is granted. Pause and arm again to pick a new validity.
            </Notice>
          ) : (
            <Segmented label="Key validity" value={days} onChange={setDays} options={DAY_OPTIONS} />
          )}
        </section>

        {preview.unsupported.length > 0 && (
          <Notice tone="warning">
            The router cannot run {preview.unsupported.length === 1 ? "this rule" : "these rules"}: {preview.unsupported.map((r) => `“${r.name}”`).join(", ")}. {preview.unsupported.length === 1 ? "It is" : "They are"} left out when the rules are saved. Edit {preview.unsupported.length === 1 ? "it" : "them"} or switch {preview.unsupported.length === 1 ? "it" : "them"} off.
          </Notice>
        )}

        {preview.errors.length > 0 && (
          <Notice tone="warning">
            <div>Fix these before arming:</div>
            <ul className="num mt-1.5 grid gap-1 text-xs">{preview.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Notice>
        )}

        {noAccount && !canOpen && (
          <Notice
            tone="warning"
            actions={<Button variant="outline" size="lg" className="min-h-11" nativeButton={false} render={<Link href="/funds" />}>Add funds</Button>}
          >
            This wallet has no XOXNO position and less than 1 USDC to open one with. Bring lira in, or receive USDC, then arm.
          </Notice>
        )}

        <section className="grid gap-3">
          <h3 className="text-xs uppercase tracking-[0.12em] text-muted-foreground">What happens when you tap Arm</h3>
          <ol className="grid gap-3">
            {canOpen && (
              <Step n={1} state={openState} title="Open your position">
                <span className="inline-flex items-center gap-1"><PiggyBank className="size-3" aria-hidden /> One passkey prompt supplies the <span className="num">{fmtUsdc(idle)} USDC</span> in your wallet to {openPool.name}. XOXNO creates the position and Koul reads its id, so the rules have an account to manage.</span>
              </Step>
            )}
            <Step n={canOpen ? 2 : 1} state={grantState} title={keyActive ? "Grant Koul's key (already done)" : "Grant Koul's key"}>
              <span className="inline-flex items-center gap-1"><KeyRound className="size-3" aria-hidden /> {keyActive ? "An active key is on your smart account, so this prompt is skipped." : `One passkey prompt adds the keeper's key to your smart account, restricted by the Koul policy, for ${days} day${days === 1 ? "" : "s"}.`}</span>
            </Step>
            <Step n={canOpen ? 3 : 2} state={rulesState} title={storedSame ? "Save the rules on-chain (already done)" : "Save the rules on-chain"}>
              <span className="inline-flex items-center gap-1"><ScrollText className="size-3" aria-hidden /> {storedSame ? "The router already holds exactly these rules, so this prompt is skipped." : "One passkey prompt writes the rules to the router. Koul starts checking them within a few minutes."}</span>
            </Step>
          </ol>
        </section>
      </div>
    </ResponsiveSheet>
  );
}
