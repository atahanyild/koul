"use client";

/**
 * The Autopilot page: the rules are the page. One autopilot per wallet, as many rules as the router holds. LIVE
 * shows what is running now and the rules with live values, a tap on a rule opens it in the editor; EDITING keeps
 * a draft and the composer until one passkey saves it on the router; OFF offers the composer and three templates.
 * Access (Koul's limited key) is granted with the first save and shown in the chip at the top.
 */
import * as React from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useAutopilotLive } from "@/hooks/use-autopilot-live";
import { useLiveValues } from "@/hooks/use-live-values";
import { bestPool, usePools } from "@/hooks/use-market";
import { useWallet } from "@/hooks/use-wallet";
import { chainUiId, useArmAutopilot } from "@/hooks/use-autopilots";
import { invalidate } from "@/lib/data/store";
import { newId, toCoreAutopilot, type Autopilot } from "@/lib/model/autopilot";
import { phaseDetail, planDelete, planSteps, saveSteps, type SaveStep, type SaveStepKey } from "@/lib/model/save-steps";
import { decodeRules, type LibraryEntry } from "@/lib/model/library";
import { Label, PillButton, Sk, StatusPill, Tile, type StatusKind } from "@/components/signal";
import { AccessChip } from "@/components/autopilot-page/access";
import { Chat } from "@/components/autopilot-page/chat";
import type { ChatDraft } from "@/lib/chat/reducer";
import { describeChanges, diffRules, type RuleChange } from "@/lib/chat/diff";
import type { LiveContext } from "@/lib/chat/schema";
import { RulesHeader, RulesList } from "@/components/autopilot-page/rules-list";
import { Running } from "@/components/autopilot-page/running";
import { copyShareLink, Library, SaveToLibrary } from "@/components/autopilot-page/library";
import { Holdings, type HoldingsFocus } from "@/components/autopilot-page/holdings";
import { Capital } from "@/components/autopilot-page/capital";
import { RuleEditor, pairingProblem, ruleTemplate } from "@/components/autopilot-page/rule-editor";
import { SaveBar, type AccessAsk } from "@/components/autopilot-page/save-bar";
import { Templates } from "@/components/autopilot-page/templates";
import { useEditor } from "@/components/autopilot-page/use-editor";

const ACCESS_DAYS = 30;
const OPEN_WITH_USDC = 1_0000000n;
const MAX_CONTRACT_RULES = 32;

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
  const [waitingForId, setWaitingForId] = React.useState(false);
  const busy = armer.openAction.busy || armer.grantAction.busy || armer.rulesAction.busy || waitingForId;
  const first = live.status === "off";
  const verb = first ? "Start" : "Update";
  const busyLabel = armer.openAction.busy ? "Opening your position" : waitingForId ? "Reading your position" : armer.grantAction.busy ? "Giving access" : armer.rulesAction.busy ? (first ? "Starting autopilot" : "Updating autopilot") : null;
  const stepLabels = React.useMemo(() => ({ rules: first ? "Start autopilot" : "Update rules" }), [first]);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);

  // The passkey steps of the save in progress. The plan is fixed when the save starts, so a step that lands does
  // not vanish from the strip; Try again keeps the same plan and resumes at the step that failed.
  const [plan, setPlan] = React.useState<SaveStepKey[] | null>(null);
  const [failedStep, setFailedStep] = React.useState<{ key: SaveStepKey; reason: string } | null>(null);
  const [completed, setCompleted] = React.useState(false);
  /** Which flow the strip belongs to, so Try again resumes the right one. */
  const flow = React.useRef<"save" | "delete">("save");
  const [deleteDone, setDeleteDone] = React.useState({ clear: false, revoke: false });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [savingToLibrary, setSavingToLibrary] = React.useState(false);
  const nextPlan = React.useMemo(() => planSteps({ needsPosition, hasAccess: live.access.active }), [needsPosition, live.access.active]);
  const confirmations = rules.length === 0 ? 1 : nextPlan.length;
  const progress = React.useMemo<SaveStep[] | null>(() => {
    if (!plan) return null;
    const deleting = plan.includes("clear");
    const active: { key: SaveStepKey; detail: string | null } | null = armer.openAction.busy ? { key: "open", detail: phaseDetail(armer.openAction.phase) }
      : waitingForId ? { key: "open", detail: "Reading your position id" }
      : armer.grantAction.busy ? { key: deleting ? "revoke" : "grant", detail: phaseDetail(armer.grantAction.phase) }
      : armer.rulesAction.busy ? { key: deleting ? "clear" : "rules", detail: phaseDetail(armer.rulesAction.phase) }
      : null;
    const done = {
      open: completed || !needsPosition || armer.openAction.phase === "success",
      grant: completed || live.access.active || armer.grantAction.phase === "success",
      rules: completed || armer.rulesAction.phase === "success",
      clear: completed || deleteDone.clear,
      revoke: completed || deleteDone.revoke,
    };
    return saveSteps({ plan, done, active, failed: failedStep, labels: stepLabels });
  }, [plan, stepLabels, armer.openAction.busy, armer.openAction.phase, armer.grantAction.busy, armer.grantAction.phase, armer.rulesAction.busy, armer.rulesAction.phase, waitingForId, completed, needsPosition, live.access.active, failedStep, deleteDone]);
  const clearProgress = React.useCallback(() => { setPlan(null); setFailedStep(null); setCompleted(false); setDeleteDone({ clear: false, revoke: false }); flow.current = "save"; }, []);

  const [justSaved, setJustSaved] = React.useState(false);
  /** The chain does the work; the page only leaves editing once the chain read shows the saved rules. */
  const settle = React.useCallback(async () => {
    invalidate("check:"); invalidate("tick:"); invalidate("events:");
    await live.refresh();
    // The bar turns accent with a check for a moment, then the page leaves editing and the bar slides away.
    setJustSaved(true);
    await new Promise((r) => setTimeout(r, 1200));
    setJustSaved(false);
    clearProgress();
    editor.discard();
    setHighlight(null);
    setChatChanges([]);
  }, [live, editor, clearProgress]);

  const submit = React.useCallback(async () => {
    setAsking(false);
    setSaveError(null);
    setFailedStep(null);
    if (plan === null) {
      // A fresh save: the phases of an earlier save must not count as done for this one.
      setPlan(nextPlan);
      setCompleted(false);
      armer.openAction.reset(); armer.grantAction.reset(); armer.rulesAction.reset();
    }
    const ap: Autopilot = { id: live.chainId !== null ? chainUiId(live.chainId) : newId("ap"), name: "Autopilot", description: "", rules, status: "draft", createdAt: Date.now(), armedUntil: null, agentRuleId: null, runs: 0, lastRunAt: null };
    setWaitingForId(needsPosition);
    let res: Awaited<ReturnType<typeof armer.arm>>;
    try {
      res = await armer.arm(ap, { days: ACCESS_DAYS, accountId: pf.accountId, openWith: needsPosition ? { hub: openHub, units: OPEN_WITH_USDC } : undefined });
    } finally {
      setWaitingForId(false);
    }
    if (res.ok) { setCompleted(true); await settle(); return; }
    // Stay in editing. A step that failed stays marked in the strip with its reason; anything before the first
    // passkey (the wallet, the rules themselves) goes in the bar's line. A transaction that failed already toasted.
    const key: SaveStepKey | null = res.step === "open" || res.step === "account" ? "open" : res.step === "grant" ? "grant" : res.step === "write" ? "rules" : null;
    const reason = res.reason.replace(/^[^:]{0,60}: /, "");
    if (key) { setFailedStep({ key, reason }); return; }
    clearProgress();
    setSaveError(res.reason);
    if (!res.toasted) toast.error(first ? "Autopilot not started" : "Autopilot not updated", { description: res.reason });
  }, [live.chainId, rules, armer, pf.accountId, needsPosition, openHub, settle, plan, nextPlan, clearProgress, first]);

  /** Remove the rules from the router, then the key when there is one. `resume` continues after a failed step. */
  const remove = React.useCallback(async (resume: boolean) => {
    if (live.chainId === null) return;
    setConfirmDelete(false);
    setFailedStep(null);
    let done = resume ? deleteDone : { clear: false, revoke: false };
    if (!resume) { flow.current = "delete"; setPlan(planDelete({ hasAccess: live.access.active })); setCompleted(false); setDeleteDone(done); }
    if (!done.clear) {
      const res = await armer.clear(chainUiId(live.chainId));
      if (!res) { setFailedStep({ key: "clear", reason: armer.rulesAction.lastFailure() ?? "the transaction did not go through" }); return; }
      done = { ...done, clear: true }; setDeleteDone(done);
    }
    if (live.access.active && !done.revoke) {
      const res = await armer.pause();
      if (!res) { setFailedStep({ key: "revoke", reason: armer.grantAction.lastFailure() ?? "the transaction did not go through" }); return; }
      done = { ...done, revoke: true }; setDeleteDone(done);
    }
    setCompleted(true);
    await settle();
  }, [live.chainId, live.access.active, deleteDone, armer, settle]);

  const onSave = React.useCallback(async () => {
    if (flow.current === "delete") { await remove(true); return; }
    if (blocker) return;
    setSaveError(null);
    if (rules.length === 0) {
      if (live.chainId === null) return;
      const res = await armer.clear(chainUiId(live.chainId));
      if (res) await settle();
      else setSaveError("The rules were not cleared");
      return;
    }
    // No key yet: one sentence about what Koul gets, then the passkeys. Try again after a failed step resumes.
    if ((!live.access.active || needsPosition) && plan === null) { setAsking(true); return; }
    await submit();
  }, [blocker, rules, live.chainId, live.access.active, armer, needsPosition, settle, submit, plan, remove]);

  /** Revoke the key: the rules stay on the router, nothing runs until access is given again. */
  const pause = React.useCallback(async () => {
    const res = await armer.pause();
    if (res) await live.refresh();
  }, [armer, live]);

  /** Load a set into the editor as the draft (from the library or a share link). */
  const loadRules = React.useCallback((entry: Pick<LibraryEntry, "rules">) => {
    editor.replace(entry.rules.map((r) => ({ ...r, id: newId() })), null);
    setHighlight(null);
    setChatChanges([]);
  }, [editor]);

  // A draft with no rules on a wallet that has none is no draft: back to the templates.
  React.useEffect(() => {
    if (editor.editing && rules.length === 0 && live.status === "off" && !busy) editor.discard();
  }, [editor, rules.length, live.status, busy]);

  // A share link: `/autopilot?load=<token>` opens with the set as a draft once a wallet is connected.
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (loaded.current || !w.address) return;
    const token = new URLSearchParams(window.location.search).get("load");
    if (!token) return;
    loaded.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    // Deferred a tick so the draft lands after this render, not inside the effect.
    const t = setTimeout(() => {
      const set = decodeRules(token);
      if (!set) { toast.error("That link does not hold rules Koul can read"); return; }
      loadRules(set);
      toast(`${set.rules.length} ${set.rules.length === 1 ? "rule" : "rules"} loaded from a link`, { description: set.name ? `${set.name} · save to run them on your wallet` : "Save to run them on your wallet" });
    }, 0);
    return () => clearTimeout(t);
  }, [w.address, loadRules]);

  const ask: AccessAsk | null = asking ? { needsPosition, days: ACCESS_DAYS, steps: saveSteps({ plan: nextPlan, done: {}, active: null, failed: null, labels: stepLabels }), confirmLabel: editor.editing ? `${verb} autopilot` : "Start autopilot", onConfirm: () => void submit(), onCancel: () => setAsking(false) } : null;
  const onDiscard = () => { editor.discard(); setHighlight(null); setChatChanges([]); setSaveError(null); setAsking(false); clearProgress(); };
  const bar = <SaveBar key="save-bar" changes={editor.changes} confirmations={confirmations} blocker={editor.changes === 0 ? null : blocker} error={saveError} ask={ask} saved={justSaved} savedLabel={plan?.includes("clear") ? "Autopilot removed" : plan && !plan.includes("rules") ? "Autopilot started" : first ? "Autopilot started" : "Autopilot updated"} verb={verb} busy={busy} busyLabel={busyLabel} progress={progress} onDiscard={onDiscard} onSave={() => void onSave()} onStop={editor.editing && live.status === "live" ? () => { onDiscard(); void pause(); } : undefined} />;

  if (live.loading && live.status === "off" && !editor.editing) {
    return (
      <div className="grid gap-4">
        <div className="flex items-center justify-between"><Sk className="h-11 w-28 rounded-full" /><Sk className="h-11 w-36 rounded-full" /></div>
        <Sk className="h-[220px] rounded-[var(--radius-tile)]" />
        <Sk className="h-[320px] rounded-[var(--radius-tile)]" />
      </div>
    );
  }

  const openRule = editor.open ? rules.find((r) => r.id === editor.open) ?? null : null;
  const holdingsFocus: HoldingsFocus | null = openRule ? { conditions: openRule.conditions, action: openRule.action.kind, actionPool: openRule.action.pool } : null;
  const kind: StatusKind = editor.editing ? "editing" : live.status === "live" ? "live" : "off";
  const detail = editor.editing ? `${editor.changes} ${editor.changes === 1 ? "CHANGE" : "CHANGES"}` : undefined;
  const onCount = live.rules.filter((r) => r.rule.enabled).length;
  const summary = editor.editing
    ? (live.status === "off" ? "Nothing runs until you start it" : live.status === "paused" ? "Stopped · rules kept until you start it again" : "Running rules keep going until you update")
    : live.status === "live"
      ? (live.nowOn !== null ? `${onCount} ${onCount === 1 ? "rule" : "rules"} · now on rule ${live.nowOn}` : `${onCount} ${onCount === 1 ? "rule" : "rules"} · nothing to do right now`)
      : live.status === "paused" ? "Stopped · rules kept" : "No rules yet";

  return (
    <div className="grid gap-4 md:gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill kind={kind} detail={detail} />
          <Label className="hidden sm:inline">{summary}</Label>
        </div>
        <AccessChip />
      </div>
      <Label className="sm:hidden">{summary}</Label>

      {/* The composer: the way in before the first rule, and a helper while editing. A running autopilot shows itself instead. */}
      {(editor.editing || live.status === "off") && <Chat mode={editor.editing ? "editing" : "live"} rules={rules} live={chatLive} onAccept={onAccept} onEdit={onEdit} chips={4} />}
      {(editor.editing || live.status === "off") && (
        <Holdings positions={pf.positions} health={pf.health} pools={pools.pools} fx={{ tryPerUsd: values.live.fx, stale: values.live.fxStale }} xlm={w.xlm} access={live.access} loading={pf.loading || pools.loading} focus={holdingsFocus} collapsed={editor.open === null} />
      )}

      {editor.editing ? (
        <>
          <RulesHeader hint="Top to bottom · first match runs" action={
            <div className="flex gap-1">
              {editor.canUndo && <PillButton variant="ghost" size="sm" onClick={undoChat}>Undo</PillButton>}
              {rules.length > 0 && !savingToLibrary && <PillButton variant="ghost" size="sm" onClick={() => setSavingToLibrary(true)}>Save to library</PillButton>}
            </div>
          } />
          {savingToLibrary && <SaveToLibrary rules={rules} defaultName="My autopilot" onDone={() => setSavingToLibrary(false)} onCancel={() => setSavingToLibrary(false)} />}
          {rules.length > 0 && <Capital rules={rules} onChange={(next) => editor.replace(next)} />}
          <RuleEditor editor={editor} liveRules={live.rules} live={values.live} now={now} highlight={highlight} changes={chatChanges} onUndo={undoChat} onAdd={() => editor.add(ruleTemplate())} />
          <Library onUse={loadRules} now={now} />
          <AnimatePresence>{bar}</AnimatePresence>
        </>
      ) : live.status === "off" ? (
        <>
          <Templates onAdd={(rule) => editor.add(rule)} />
          <Library onUse={loadRules} now={now} />
          <AnimatePresence>{(plan !== null || justSaved) && bar}</AnimatePresence>
        </>
      ) : (
        <>
          <Running ap={live} now={now} actions={
            <>
              {live.status === "paused" && live.access.loaded && <PillButton size="md" onClick={() => setAsking(true)} disabled={busy || asking}>Start autopilot</PillButton>}
              {live.status === "live" && <PillButton variant="outline" size="md" onClick={() => void pause()} disabled={busy} aria-busy={armer.grantAction.busy}>{armer.grantAction.busy && plan === null ? "Passkey" : "Stop"}</PillButton>}
              <PillButton variant="outline" size="md" onClick={() => setSavingToLibrary((v) => !v)} disabled={busy}>Save to library</PillButton>
              <PillButton variant="outline" size="md" onClick={() => void copyShareLink(saved)} disabled={busy}>Link</PillButton>
              <PillButton variant="ghost" size="md" onClick={() => setConfirmDelete(true)} disabled={busy || confirmDelete}>Delete</PillButton>
            </>
          } />
          {savingToLibrary && <SaveToLibrary rules={saved} defaultName="My autopilot" onDone={() => setSavingToLibrary(false)} onCancel={() => setSavingToLibrary(false)} />}
          {confirmDelete && (
            <Tile tone="outlined" className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <p className="text-[15px] text-text md:max-w-[640px]">Remove {live.rules.length === 1 ? "this rule" : `all ${live.rules.length} rules`} from the router{live.access.active ? " and revoke Koul's key" : ""}? Nothing runs afterwards. {live.access.active ? "Two passkey confirmations." : "One passkey confirmation."}</p>
              <div className="flex flex-col-reverse gap-3 md:flex-row">
                <PillButton variant="outline" size="lg" onClick={() => setConfirmDelete(false)}>Keep it</PillButton>
                <PillButton size="lg" onClick={() => void remove(false)}>Delete</PillButton>
              </div>
            </Tile>
          )}
          <RulesList rules={live.rules} now={now} onEdit={editor.begin} onOpen={editor.beginAt} stopped={live.status === "paused"} />
          <AnimatePresence>{(asking || plan !== null || justSaved) && bar}</AnimatePresence>
        </>
      )}
    </div>
  );
}
