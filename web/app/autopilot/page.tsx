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
import { bestPool, usePools } from "@/hooks/use-market";
import { useWallet } from "@/hooks/use-wallet";
import { chainUiId, useArmAutopilot } from "@/hooks/use-autopilots";
import { invalidate } from "@/lib/data/store";
import { newId, toCoreAutopilot, type Autopilot } from "@/lib/model/autopilot";
import { Label, PillButton, Sk, StatusPill, type StatusKind } from "@/components/signal";
import { AccessChip } from "@/components/autopilot-page/access";
import { Chat } from "@/components/autopilot-page/chat";
import type { ChatDraft } from "@/lib/chat/reducer";
import { describeChanges, diffRules, type RuleChange } from "@/lib/chat/diff";
import type { LiveContext } from "@/lib/chat/schema";
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
  const values = useLiveValues();
  const armer = useArmAutopilot();
  const now = useMinute();
  const saved = React.useMemo(() => live.rules.map((r) => r.rule), [live.rules]);
  const editor = useEditor(w.address, saved);

  // The chat: what Koul may quote, and what happens when a draft is accepted.
  const chatLive = React.useMemo<LiveContext>(() => ({ fx: values.live.fx, healthFactor: values.live.healthFactor, hasLoan: values.live.hasLoan, rateA: values.live.rateA, rateB: values.live.rateB, idleUsdc: values.live.idleUsdc }), [values.live]);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  // What the chat changed while editing: the rows get CHANGED · UNDO until the change is undone or saved.
  const [chatChanges, setChatChanges] = React.useState<RuleChange[]>([]);
  const onEdit = React.useCallback((draft: ChatDraft): string | null => {
    const changes = diffRules(editor.rules, draft.rules);
    const rule = draft.rules[draft.position - 1];
    editor.replace(draft.rules, editor.open && draft.rules.some((r) => r.id === editor.open) ? editor.open : null);
    setChatChanges(changes);
    setHighlight(changes.some((c) => c.kind === "added") ? rule?.id ?? null : null);
    return describeChanges(changes);
  }, [editor]);
  const undoChat = React.useCallback(() => { editor.undo(); setChatChanges([]); }, [editor]);
  const onAccept = React.useCallback((draft: ChatDraft, how: "add" | "adjust") => {
    const rule = draft.rules[draft.position - 1];
    editor.replace(draft.rules, how === "adjust" && rule ? rule.id : null);
    setHighlight(rule?.id ?? null);
  }, [editor]);

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
    setHighlight(null);
    setChatChanges([]);
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

      <Chat mode={editor.editing ? "editing" : "live"} rules={rules} live={chatLive} onAccept={onAccept} onEdit={onEdit} chips={4} />

      {editor.editing ? (
        <>
          <RulesHeader hint="Top to bottom · first match runs" action={editor.canUndo ? <PillButton variant="ghost" size="sm" onClick={undoChat}>Undo</PillButton> : undefined} />
          <RuleEditor editor={editor} liveRules={live.rules} live={values.live} now={now} highlight={highlight} changes={chatChanges} onUndo={undoChat} onAdd={() => editor.add(ruleTemplate())} />
          <SaveBar changes={editor.changes} confirmations={confirmations} blocker={editor.changes === 0 ? null : blocker} error={saveError} ask={ask} busy={busy} busyLabel={busyLabel} onDiscard={() => { editor.discard(); setHighlight(null); setChatChanges([]); setSaveError(null); setAsking(false); }} onSave={() => void onSave()} />
        </>
      ) : live.status === "off" ? (
        <Templates onAdd={(rule) => editor.add(rule)} />
      ) : (
        <RulesList rules={live.rules} now={now} onEdit={editor.begin} />
      )}
    </div>
  );
}
