"use client";

/**
 * One autopilot: its rules as cards in the order the router checks them, what would run right now, what Koul may
 * do, the runs so far, and the actions: arm, pause, remove. `id` is a local draft id or `chain-<n>` for an
 * autopilot the router holds. Edits to a chain autopilot wait locally until it is armed again.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, Pause, Plus, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, Section, Term } from "@/components/koul/primitives";
import { useWallet } from "@/hooks/use-wallet";
import { chainIdOf, chainUiId, useArmAutopilot, useAutopilot, useAutopilotEditor, type ArmResult } from "@/hooks/use-autopilots";
import { useChainAutopilots } from "@/hooks/use-portfolio";
import { useLiveValues } from "@/hooks/use-live-values";
import { useActivity } from "@/hooks/use-activity";
import { evaluateAutopilot, permissionsFor, type Rule } from "@/lib/model/autopilot";
import { RuleCard } from "@/components/autopilot/rule-card";
import { RuleEditorSheet } from "@/components/autopilot/rule-editor";
import { AutopilotPageSkeleton, BackEyebrow, CanList, CheckedAgo, DecisionBanner, EditableName, KeyValidity, Notice, RunsList, StatusPill, useNow } from "@/components/autopilot/autopilot-bits";
import { clearPendingEdits, moveItem, rulesEqual, usePendingEdits } from "@/components/autopilot/local-state";
import { ArmSheet } from "@/components/autopilot/detail/arm-sheet";
import { ConfirmSheet } from "@/components/autopilot/detail/confirm-sheet";

type Confirm = "pause" | "remove" | "delete" | null;
const NO_RULES = { rules: [] as Rule[] };

export default function AutopilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const w = useWallet();
  const chainId = chainIdOf(id);
  const isChain = chainId !== null;
  const { autopilot: stored, loading } = useAutopilot(id);
  const chain = useChainAutopilots();
  const edits = useAutopilotEditor();
  const pendingEdits = usePendingEdits(id);
  const armer = useArmAutopilot();
  const { live, loading: liveLoading } = useLiveValues();
  const activity = useActivity();
  const now = useNow(20_000);

  // The autopilot as shown: a chain autopilot wears its pending edits until they are armed.
  const pendingRules = isChain ? pendingEdits.pending?.rules ?? null : null;
  const ap = React.useMemo(() => {
    if (!stored) return null;
    if (pendingRules && !rulesEqual(pendingRules, stored.rules)) return { ...stored, rules: pendingRules };
    return stored;
  }, [stored, pendingRules]);
  const hasPending = ap !== null && ap !== stored;
  const evaluation = React.useMemo(() => evaluateAutopilot(ap ?? NO_RULES, live), [ap, live]);

  const [checkedAt, setCheckedAt] = React.useState(() => Date.now());
  React.useEffect(() => { if (!liveLoading) setCheckedAt(Date.now()); }, [live, liveLoading]);

  // Right after arming a draft the router list may not hold the new id yet: read it once more before saying "not found".
  const [rechecked, setRechecked] = React.useState(false);
  React.useEffect(() => { setRechecked(false); }, [id]);
  const refreshChain = chain.refresh;
  React.useEffect(() => {
    if (stored || loading || !isChain || !w.isConnected || rechecked) return;
    let cancelled = false;
    void refreshChain().finally(() => { if (!cancelled) setRechecked(true); });
    return () => { cancelled = true; };
  }, [stored, loading, isChain, w.isConnected, rechecked, refreshChain]);

  const runs = React.useMemo(() => (isChain ? activity.items.filter((it) => it.autopilotName === `Autopilot ${chainId}`) : []), [activity.items, isChain, chainId]);

  const [editorState, setEditorState] = React.useState<{ open: boolean; rule: Rule | null; key: number }>({ open: false, rule: null, key: 0 });
  const [armOpen, setArmOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm>(null);

  const openEditor = React.useCallback((rule: Rule | null) => setEditorState((s) => ({ open: true, rule, key: s.key + 1 })), []);

  const applyRules = React.useCallback((rules: Rule[]) => {
    if (!stored) return;
    if (!isChain) { edits.update(id, { rules }, stored); return; }
    if (rulesEqual(rules, stored.rules)) pendingEdits.clear();
    else pendingEdits.set({ ...stored, rules });
  }, [stored, isChain, id, edits, pendingEdits]);

  const onArmed = (res: Extract<ArmResult, { ok: true }>) => {
    pendingEdits.clear();
    const nextId = chainUiId(res.chainId);
    if (nextId !== id) { clearPendingEdits(nextId); router.replace(`/autopilots/${nextId}`); }
  };

  const pause = async () => {
    const res = await armer.pause();
    if (res) setConfirm(null);
  };
  const remove = async () => {
    const res = await armer.clear(id);
    if (res) { pendingEdits.clear(); setConfirm(null); router.replace("/autopilots"); }
  };
  const deleteDraft = () => {
    edits.remove(id);
    setConfirm(null);
    router.replace("/autopilots");
  };

  if (w.initializing || loading || (!stored && isChain && w.isConnected && !rechecked)) return <AutopilotPageSkeleton />;

  if (!ap || !stored) {
    return (
      <>
        <div className="mb-6"><BackEyebrow /></div>
        <EmptyState
          icon={Compass}
          title="Autopilot not found"
          description={isChain && !w.isConnected ? "Connect your wallet to see the autopilots the router holds for it." : isChain ? "The router does not hold an autopilot with this id for your wallet. It may have been removed." : "This draft is not in this browser. Drafts live where they were written until they are armed."}
          action={<Button variant="outline" size="lg" className="min-h-11" nativeButton={false} render={<Link href="/autopilots" />}>Back to autopilots</Button>}
        />
      </>
    );
  }

  const readOnly = ap.status === "ended";
  const armed = ap.status === "armed";
  const armLabel = isChain && (armed || hasPending) ? "Arm again" : "Arm";
  const armPrimary = !armed || hasPending;
  const permissions = permissionsFor(ap);
  const count = ap.rules.length;

  const actions = (className?: string) => readOnly ? null : (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button variant="outline" size="lg" className="min-h-11" onClick={() => openEditor(null)}>
        <Plus data-icon="inline-start" /> Add rule
      </Button>
      {isChain && armed && (
        <Button variant="outline" size="lg" className="min-h-11" onClick={() => setConfirm("pause")}>
          <Pause data-icon="inline-start" /> Pause
        </Button>
      )}
      {isChain ? (
        <Button variant="ghost" size="lg" className="min-h-11 text-muted-foreground hover:text-negative" onClick={() => setConfirm("remove")}>
          <Trash2 data-icon="inline-start" /> Remove
        </Button>
      ) : (
        <Button variant="ghost" size="lg" className="min-h-11 text-muted-foreground hover:text-negative" onClick={() => setConfirm("delete")}>
          <Trash2 data-icon="inline-start" /> Delete draft
        </Button>
      )}
      <Button variant={armPrimary ? "default" : "outline"} size="lg" className="min-h-11 px-4 text-[15px]" onClick={() => setArmOpen(true)}>
        <Zap data-icon="inline-start" /> {armLabel}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={<BackEyebrow />}
        title={<EditableName name={ap.name} editable={!readOnly} onRename={(name) => edits.update(id, { name }, stored)} />}
        chips={<><StatusPill status={ap.status} /><KeyValidity ap={ap} now={now} /></>}
        description={ap.description || undefined}
        actions={actions("max-md:hidden")}
      />

      {chain.error && isChain && (
        <ErrorState className="mb-5" title="Could not read the router" description="Showing the last known rules until the next read succeeds." onRetry={() => void chain.refresh()} />
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <DecisionBanner ap={ap} evaluation={evaluation} loading={liveLoading} className="mb-4" />

          {hasPending && (
            <Notice
              tone="saffron"
              className="mb-4"
              actions={
                <>
                  <Button variant="ghost" size="lg" className="min-h-11 text-muted-foreground" onClick={pendingEdits.clear}>Discard</Button>
                  <Button size="lg" className="min-h-11 px-4 text-[15px]" onClick={() => setArmOpen(true)}>Arm again</Button>
                </>
              }
            >
              Changes are not on-chain yet. The router keeps running the saved rules until you arm again.
            </Notice>
          )}

          {isChain && ap.status === "paused" && !hasPending && (
            <Notice tone="warning" className="mb-4" actions={<Button size="lg" className="min-h-11 px-4 text-[15px]" onClick={() => setArmOpen(true)}>Arm</Button>}>
              Koul&apos;s key is not active, so nothing runs. The rules are still stored on the router.
            </Notice>
          )}

          <Section
            title="Rules"
            description="Checked top to bottom every few minutes. The first true rule runs, the rest wait for the next check."
            aside={<CheckedAgo at={checkedAt} now={now} loading={liveLoading} />}
            className="mt-8"
          >
            {count === 0 ? (
              <EmptyState
                title="No rules yet"
                description="Rules appear here as cards, in the order they are checked."
                action={!readOnly && <Button size="lg" className="min-h-11 px-4 text-[15px]" onClick={() => openEditor(null)}><Plus data-icon="inline-start" /> Add a rule</Button>}
              />
            ) : (
              <ol className="grid gap-3">
                {ap.rules.map((rule, i) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    ev={evaluation.rules[i]!}
                    index={i}
                    count={count}
                    readOnly={readOnly}
                    onEdit={readOnly ? undefined : openEditor}
                    onMove={readOnly ? undefined : (index, dir) => applyRules(moveItem(ap.rules, index, dir))}
                  />
                ))}
              </ol>
            )}
            {count > 0 && !readOnly && (
              <Button variant="outline" size="lg" className="mt-3 min-h-11 w-full justify-start border-dashed text-muted-foreground" onClick={() => openEditor(null)}>
                <Plus data-icon="inline-start" /> Add rule
              </Button>
            )}
          </Section>
        </div>

        <aside className="min-w-0">
          <Section title="What Koul can do" description={armed ? "Allowed by the key on your smart account." : "What the key will allow once armed."}>
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              {permissions.can.length ? (
                <CanList items={permissions.can} tone={armed ? "positive" : "muted"} />
              ) : (
                <p className="text-sm text-muted-foreground">No rule is switched on, so the key would allow nothing.</p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                It cannot send funds anywhere else, change these rules, or act after the key expires.{" "}
                <Term detail={<ul className="grid gap-0.5">{permissions.technical.map((t) => <li key={t}>{t}</li>)}</ul>}>Technical</Term>
              </p>
            </div>
          </Section>

          <Section title="Runs" description={isChain ? "What this autopilot executed, newest first." : "Runs appear here once it is armed."}>
            <RunsList items={runs} status={ap.status} now={now} loading={isChain && activity.loading} />
          </Section>
        </aside>
      </div>

      {!readOnly && (
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-border bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6 md:hidden">
          {actions("justify-end")}
        </div>
      )}

      {!readOnly && (
        <RuleEditorSheet
          key={editorState.key}
          open={editorState.open}
          onOpenChange={(open) => setEditorState((s) => ({ ...s, open }))}
          rule={editorState.rule}
          live={live}
          onSave={(rule) => {
            const exists = ap.rules.some((r) => r.id === rule.id);
            applyRules(exists ? ap.rules.map((r) => (r.id === rule.id ? rule : r)) : [...ap.rules, rule]);
          }}
          onDelete={(ruleId) => applyRules(ap.rules.filter((r) => r.id !== ruleId))}
        />
      )}

      {!readOnly && <ArmSheet open={armOpen} onOpenChange={setArmOpen} ap={ap} onArmed={onArmed} />}

      <ConfirmSheet
        open={confirm === "pause"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Pause this autopilot?"
        description="Koul's key is revoked from your smart account. One passkey confirmation."
        confirmLabel="Pause"
        action={armer.grantAction}
        onConfirm={pause}
      >
        <p>The keeper loses access immediately and nothing runs until you arm again.</p>
        <p className="text-muted-foreground">The rules stay stored on the router. Every autopilot on this wallet shares the same key, so all of them pause together.</p>
      </ConfirmSheet>

      <ConfirmSheet
        open={confirm === "remove"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Remove this autopilot?"
        description="The router forgets these rules. One passkey confirmation."
        confirmLabel="Remove"
        destructive
        action={armer.rulesAction}
        onConfirm={remove}
      >
        <p>The rules are cleared from the router and this page goes away. Past runs stay in Activity.</p>
        <p className="text-muted-foreground">Koul&apos;s key stays on your smart account for any other autopilot; pause to revoke it.</p>
      </ConfirmSheet>

      <ConfirmSheet
        open={confirm === "delete"}
        onOpenChange={(o) => { if (!o) setConfirm(null); }}
        title="Delete this draft?"
        description="It only exists in this browser. Nothing on-chain changes."
        confirmLabel="Delete draft"
        destructive
        onConfirm={deleteDraft}
      />
    </>
  );
}
