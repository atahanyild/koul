"use client";

/**
 * New autopilot. The sentence box is the page: say what you want, Koul writes the rules, you read and adjust them
 * in the builder below. Templates and Add rule are the other two ways in. Saving creates a local draft and opens
 * its page, where the arm sheet lives.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill } from "@/components/koul/primitives";
import { BackEyebrow, Notice } from "@/components/autopilot/autopilot-bits";
import { rememberUnplaced } from "@/components/autopilot/local-state";
import { SentenceBox } from "@/components/autopilot/new/sentence-box";
import { RuleBuilder } from "@/components/autopilot/new/rule-builder";
import { buildParseContext, parseWithKoul, type ParseSource } from "@/components/autopilot/new/parse";
import { useAutopilotEditor } from "@/hooks/use-autopilots";
import { useLiveValues } from "@/hooks/use-live-values";
import { useFx } from "@/hooks/use-market";
import { usePortfolio } from "@/hooks/use-portfolio";
import { TEMPLATES, type Rule, type Template } from "@/lib/model/autopilot";

interface LastParse { source: ParseSource; count: number; unplaced: string[]; reason: string | null }

export default function NewAutopilotPage() {
  return (
    <React.Suspense fallback={<PageHeader eyebrow={<BackEyebrow />} title="New autopilot" />}>
      <NewAutopilot />
    </React.Suspense>
  );
}

function NewAutopilot() {
  const router = useRouter();
  const params = useSearchParams();
  const template = React.useMemo(() => TEMPLATES.find((t) => t.id === params.get("template")) ?? null, [params]);

  const { live, loading: liveLoading } = useLiveValues();
  const fx = useFx();
  const portfolio = usePortfolio();
  const editor = useAutopilotEditor();

  const [sentence, setSentence] = React.useState(() => template?.description ?? "");
  const [name, setName] = React.useState(() => template?.name ?? "Untitled autopilot");
  const [rules, setRules] = React.useState<Rule[]>(() => template?.rules() ?? []);
  const [busy, setBusy] = React.useState(false);
  const [last, setLast] = React.useState<LastParse | null>(null);
  const [saving, setSaving] = React.useState<"draft" | "arm" | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  const turnIntoRules = async () => {
    const text = sentence.trim();
    if (!text || busy) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      const context = buildParseContext(live, portfolio.accountId?.toString() ?? "0", fx.loading ? null : fx.fx.ageSec);
      const parsed = await parseWithKoul(text, context, controller.signal);
      if (controller.signal.aborted) return;
      setRules(parsed.rules);
      setName(parsed.name);
      setLast({ source: parsed.source, count: parsed.rules.length, unplaced: parsed.unplaced, reason: parsed.fallbackReason });
    } catch {
      if (controller.signal.aborted) return;
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const useTemplate = (t: Template) => {
    setRules(t.rules());
    setName(t.name);
    setSentence(t.description);
    setLast(null);
  };

  const save = (next: "draft" | "arm") => {
    if (rules.length === 0 || saving) return;
    setSaving(next);
    const draft = editor.create({ name: name.trim() || "Untitled autopilot", description: sentence.trim(), rules });
    if (last?.unplaced.length) rememberUnplaced(draft.id, last.unplaced);
    router.push(`/autopilots/${draft.id}`);
  };

  const canSave = rules.length > 0 && !saving && !busy;
  const actions = (className?: string) => (
    <>
      <Button variant="outline" size="lg" className={cn("min-h-11", className)} disabled={!canSave} onClick={() => save("draft")}>
        <Save data-icon="inline-start" /> Save draft
      </Button>
      <Button size="lg" className={cn("min-h-11 px-4 text-[15px]", className)} disabled={!canSave} onClick={() => save("arm")}>
        Continue to arm <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={<BackEyebrow />}
        title="New autopilot"
        chips={<Pill tone="outline">Draft</Pill>}
        description="Describe it the way you would tell a friend. Koul writes the rules, you check them, then arm it with your passkey."
        actions={<div className="hidden items-center gap-2 md:flex">{actions()}</div>}
      />

      <div className="grid gap-6 sm:gap-8">
        <SentenceBox value={sentence} onChange={setSentence} onSubmit={() => void turnIntoRules()} busy={busy} lastSource={last?.source ?? null} lastCount={last?.count ?? null} />

        {last && last.unplaced.length > 0 && (
          <Notice tone={last.count === 0 ? "warning" : "neutral"} onDismiss={() => setLast((l) => (l ? { ...l, unplaced: [] } : l))}>
            <span className="font-medium">{last.count === 0 ? "Koul could not place that:" : "Worth knowing:"}</span>
            <ul className="mt-1 grid gap-1 text-sm">
              {last.unplaced.slice(0, 2).map((u, i) => <li key={i}>{u.replace(/\s+/g, " ").slice(0, 180)}</li>)}
            </ul>
            {last.count === 0 && <span className="mt-1 block text-xs text-muted-foreground">Nothing was invented for it. Add a rule by hand if it fits the vocabulary.</span>}
          </Notice>
        )}
        {last && last.count === 0 && last.unplaced.length === 0 && (
          <Notice tone="neutral" onDismiss={() => setLast(null)}>
            Nothing in that sentence matched what the router can check or do. Try one of the examples, pick a template, or add a rule by hand.
          </Notice>
        )}
        {last?.reason && (
          <Notice tone="neutral" onDismiss={() => setLast((l) => (l ? { ...l, reason: null } : l))}>
            Koul&apos;s parser could not answer ({last.reason}), so the rules were matched by keywords instead.
          </Notice>
        )}

        <RuleBuilder name={name} onNameChange={setName} rules={rules} onRulesChange={setRules} onUseTemplate={useTemplate} live={live} liveLoading={liveLoading} />
      </div>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 grid grid-cols-2 gap-2 border-t border-border bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:-mx-6 sm:px-6 md:hidden">
        {actions("min-h-12 w-full")}
      </div>
    </>
  );
}
