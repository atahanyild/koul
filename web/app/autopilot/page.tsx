"use client";

/**
 * The Autopilot page: the rules are the page. LIVE shows them read-only with live values; EDITING keeps a draft
 * until one passkey saves it on the router; OFF offers the composer and three templates. Access (Koul's limited
 * key) is granted with the first save and shown in the chip at the top.
 */
import * as React from "react";
import { toast } from "sonner";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useLiveValues } from "@/hooks/use-live-values";
import { bestPool, useFx, usePools } from "@/hooks/use-market";
import { useWallet } from "@/hooks/use-wallet";
import { chainUiId, useArmAutopilot } from "@/hooks/use-autopilots";
import { invalidate } from "@/lib/data/store";
import { newId, toCoreAutopilot, type Autopilot } from "@/lib/model/autopilot";
import { buildParseContext, parseWithKoul } from "@/lib/parse";
import { Label, Sk, StatusPill, type StatusKind } from "@/components/signal";
import { AccessChip } from "@/components/autopilot-page/access";
import { Composer } from "@/components/autopilot-page/composer";
import { RulesHeader, RulesList } from "@/components/autopilot-page/rules-list";
import { RuleEditor, pairingProblem, ruleTemplate } from "@/components/autopilot-page/rule-editor";
import { SaveBar, type AccessAsk } from "@/components/autopilot-page/save-bar";
import { Templates } from "@/components/autopilot-page/templates";
import { useEditor } from "@/components/autopilot-page/use-editor";

const ACCESS_DAYS = 30;
const OPEN_WITH_USDC = 1_0000000n;
const MAX_CONTRACT_RULES = 8;

function useMinute(): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function AutopilotPage() {
  const w = useWallet();
  const live = useAutopilotLive();
  const pf = usePortfolio();
  const pools = usePools();
  const fx = useFx();
  const values = useLiveValues();
  const armer = useArmAutopilot();
  const now = useMinute();
  const saved = React.useMemo(() => live.rules.map((r) => r.rule), [live.rules]);
  const editor = useEditor(w.address, saved);

  // Sentence to rules
  const [parsing, setParsing] = React.useState(false);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState<string[]>([]);
  const onSentence = React.useCallback(async (text: string) => {
    setParsing(true); setParseError(null); setNotes([]);
    try {
      const context = buildParseContext(values.live, pf.accountId?.toString() ?? "0", fx.fx.timestamp ? fx.fx.ageSec : null);
      const result = await parseWithKoul(text, context);
      if (result.rules.length === 0) {
        setParseError(result.unplaced[0] ? `Koul cannot do that: ${result.unplaced[0]}` : "Koul could not turn that into a rule. Try one of the suggestions.");
      } else {
        editor.append(result.rules);
        setNotes(result.unplaced);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Koul could not read that");
    } finally {
      setParsing(false);
    }
  }, [values.live, pf.accountId, fx.fx.timestamp, fx.fx.ageSec, editor]);

  // Saving
  const rules = editor.rules;
  const contractCount = React.useMemo(() => toCoreAutopilot({ rules }, 0n).autopilot.rules.length, [rules]);
  const problem = rules.map(pairingProblem).find((p) => p !== null) ?? null;
  const needsPosition = pf.loaded && pf.accountId === null;
  const idle = pf.positions.idleUsdc;
  const openHub = bestPool(pools.pools)?.hub ?? 1;
  const blocker = problem
    ?? (rules.length === 0 && live.status === "off" ? "Add at least one rule" : null)
    ?? (rules.length > 0 && contractCount > MAX_CONTRACT_RULES ? `The router holds at most ${MAX_CONTRACT_RULES} rules on-chain and this list becomes ${contractCount}` : null)
    ?? (rules.length > 0 && needsPosition && idle < 1 ? "Deposit at least 1 USDC first: the first save opens your XOXNO position" : null)
    ?? (rules.length > 0 && toCoreAutopilot({ rules }, 0n).unsupported.length ? "One rule is not something the router can run" : null);
  const confirmations = rules.length === 0 ? 1 : 1 + (live.access.active ? 0 : 1) + (needsPosition ? 1 : 0);
  const [waitingForId, setWaitingForId] = React.useState(false);
  const busy = armer.openAction.busy || armer.grantAction.busy || armer.rulesAction.busy || waitingForId;
  const busyLabel = armer.openAction.busy ? "Opening your position" : waitingForId ? "Reading your position" : armer.grantAction.busy ? "Giving access" : armer.rulesAction.busy ? "Saving rules" : null;
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);

  /** The chain does the work; the page only leaves editing once the chain read shows the saved rules. */
  const settle = React.useCallback(async () => {
    invalidate("check:"); invalidate("tick:"); invalidate("events:");
    await live.refresh();
    editor.discard();
    setNotes([]);
  }, [live, editor]);

  const submit = React.useCallback(async () => {
    setAsking(false);
    setSaveError(null);
    const ap: Autopilot = { id: live.chainId !== null ? chainUiId(live.chainId) : newId("ap"), name: "Autopilot", description: "", rules, status: "draft", createdAt: Date.now(), armedUntil: null, agentRuleId: null, runs: 0, lastRunAt: null };
    setWaitingForId(needsPosition);
    let res: Awaited<ReturnType<typeof armer.arm>>;
    try {
      res = await armer.arm(ap, { days: ACCESS_DAYS, accountId: pf.accountId, openWith: needsPosition ? { hub: openHub, units: OPEN_WITH_USDC } : undefined });
    } finally {
      setWaitingForId(false);
    }
    if (res.ok) { await settle(); return; }
    // Stay in editing, and say why in the bar; a transaction that failed already said so in a toast.
    setSaveError(res.reason);
    if (!res.toasted) toast.error("Rules not saved", { description: res.reason });
  }, [live.chainId, rules, armer, pf.accountId, needsPosition, openHub, settle]);

  const onSave = React.useCallback(async () => {
    if (blocker) return;
    setSaveError(null);
    if (rules.length === 0) {
      if (live.chainId === null) return;
      const res = await armer.clear(chainUiId(live.chainId));
      if (res) await settle();
      else setSaveError("The rules were not cleared");
      return;
    }
    // No key yet: one sentence about what Koul gets, then the passkeys.
    if (!live.access.active || needsPosition) { setAsking(true); return; }
    await submit();
  }, [blocker, rules, live.chainId, live.access.active, armer, needsPosition, settle, submit]);

  const ask: AccessAsk | null = asking ? { needsPosition, days: ACCESS_DAYS, onConfirm: () => void submit(), onCancel: () => setAsking(false) } : null;

  if (live.loading && live.status === "off" && !editor.editing) {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between"><Sk className="h-11 w-28 rounded-full" /><Sk className="h-11 w-36 rounded-full" /></div>
        <Sk className="h-[220px] rounded-[var(--radius-tile)]" />
        <Sk className="h-[320px] rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  const kind: StatusKind = editor.editing ? "editing" : live.status === "live" ? "live" : "off";
  const onCount = live.rules.filter((r) => r.rule.enabled).length;
  const summary = editor.editing
    ? (live.status === "off" ? "Nothing runs until you save" : "Live rules keep running until you save")
    : live.status === "live"
      ? (live.nowOn !== null ? `${onCount} ${onCount === 1 ? "rule" : "rules"} · now on rule ${live.nowOn}` : `${onCount} ${onCount === 1 ? "rule" : "rules"} · nothing to do right now`)
      : live.status === "paused" ? "Rules saved · no access" : "No rules yet";

  return (
    <div className="grid gap-4 md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill kind={kind} />
          <Label className="hidden sm:inline">{summary}</Label>
        </div>
        <AccessChip />
      </div>
      <Label className="sm:hidden">{summary}</Label>

      <Composer variant={editor.editing ? "slim" : "large"} busy={parsing} error={parseError} onSubmit={(t) => void onSentence(t)} chips={4} />
      {notes.length > 0 && <Label className="px-2">Koul could not place: {notes.join(" · ")}</Label>}

      {editor.editing ? (
        <>
          <RulesHeader hint="Top to bottom · first match runs" />
          <RuleEditor editor={editor} liveRules={live.rules} live={values.live} now={now} onAdd={() => editor.add(ruleTemplate())} />
          <SaveBar changes={editor.changes} confirmations={confirmations} blocker={editor.changes === 0 ? null : blocker} error={saveError} ask={ask} busy={busy} busyLabel={busyLabel} onDiscard={() => { editor.discard(); setNotes([]); setSaveError(null); setAsking(false); }} onSave={() => void onSave()} />
        </>
      ) : live.status === "off" ? (
        <Templates onAdd={(rule) => editor.add(rule)} />
      ) : (
        <RulesList rules={live.rules} now={now} onEdit={editor.begin} />
      )}
    </div>
  );
}
