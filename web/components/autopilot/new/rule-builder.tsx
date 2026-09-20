"use client";

/**
 * The builder under the sentence box: the autopilot's name, its rules as numbered cards (checked top to bottom,
 * the first true one runs), move up and down, edit and delete through the rule sheet, and Add rule. With no rules
 * it offers the three templates and a by-hand start instead of an empty list.
 */
import * as React from "react";
import { Plus, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Term } from "@/components/koul/primitives";
import { DecisionBanner } from "@/components/autopilot/autopilot-bits";
import { RuleCard } from "@/components/autopilot/rule-card";
import { RuleEditorSheet } from "@/components/autopilot/rule-editor";
import { moveItem } from "@/components/autopilot/local-state";
import { evaluateAutopilot, TEMPLATES, type Autopilot, type LiveValues, type Rule, type Template } from "@/lib/model/autopilot";

const ORDER_DETAIL = "The router walks the saved rules in this order on every tick and executes the first one whose conditions hold and whose action has something to do, then applies that rule's cooldown. The others wait for the next tick.";

export interface RuleBuilderProps {
  name: string;
  onNameChange: (name: string) => void;
  rules: Rule[];
  onRulesChange: (rules: Rule[]) => void;
  onUseTemplate: (template: Template) => void;
  live: LiveValues;
  liveLoading: boolean;
  className?: string;
}

interface EditorState { open: boolean; rule: Rule | null; key: number }

export function RuleBuilder({ name, onNameChange, rules, onRulesChange, onUseTemplate, live, liveLoading, className }: RuleBuilderProps) {
  const [editor, setEditor] = React.useState<EditorState>({ open: false, rule: null, key: 0 });
  const draft = React.useMemo<Autopilot>(() => ({ id: "new", name, description: "", rules, status: "draft", createdAt: 0, armedUntil: null, agentRuleId: null, runs: 0, lastRunAt: null }), [name, rules]);
  const evaluation = React.useMemo(() => evaluateAutopilot(draft, live), [draft, live]);

  const openEditor = (rule: Rule | null) => setEditor((e) => ({ open: true, rule, key: e.key + 1 }));
  const closeEditor = (open: boolean) => setEditor((e) => ({ ...e, open }));
  const saveRule = (rule: Rule) => {
    const exists = rules.some((r) => r.id === rule.id);
    onRulesChange(exists ? rules.map((r) => (r.id === rule.id ? rule : r)) : [...rules, rule]);
  };
  const deleteRule = (ruleId: string) => onRulesChange(rules.filter((r) => r.id !== ruleId));
  const move = (index: number, dir: -1 | 1) => onRulesChange(moveItem(rules, index, dir));

  return (
    <div className={cn("grid gap-6", className)}>
      {rules.length === 0 ? (
        <EmptyBuilder onUseTemplate={onUseTemplate} onAddRule={() => openEditor(null)} />
      ) : (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="autopilot-name" className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Name</Label>
            <Input id="autopilot-name" value={name} onChange={(e) => onNameChange(e.target.value)} className="h-11 max-w-md text-base" maxLength={48} placeholder="Lira shield" />
          </div>

          <DecisionBanner ap={draft} evaluation={evaluation} loading={liveLoading} />

          <section aria-labelledby="rules-title">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 id="rules-title" className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Rules</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Checked <Term detail={ORDER_DETAIL}>top to bottom</Term>; the first true rule runs. Tap a card to change any line.
                </p>
              </div>
              <Button variant="outline" size="lg" className="min-h-11 shrink-0" onClick={() => openEditor(null)}>
                <Plus data-icon="inline-start" /> Add rule
              </Button>
            </div>
            <ol className="grid gap-3">
              {rules.map((rule, i) => (
                <RuleCard key={rule.id} rule={rule} ev={evaluation.rules[i]!} index={i} count={rules.length} onEdit={openEditor} onMove={move} />
              ))}
            </ol>
          </section>
        </>
      )}

      {editor.key > 0 && (
        <RuleEditorSheet
          key={editor.key}
          open={editor.open}
          onOpenChange={closeEditor}
          rule={editor.rule}
          live={live}
          onSave={saveRule}
          onDelete={editor.rule ? deleteRule : undefined}
        />
      )}
    </div>
  );
}

function EmptyBuilder({ onUseTemplate, onAddRule }: { onUseTemplate: (t: Template) => void; onAddRule: () => void }) {
  return (
    <section aria-labelledby="start-title">
      <div className="mb-3">
        <h2 id="start-title" className="text-[13px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Or start from a template</h2>
        <p className="mt-1 text-sm text-muted-foreground">Every line can be changed before you arm it.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {TEMPLATES.map((t) => {
          const count = t.rules().length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onUseTemplate(t)}
              className="group flex min-h-24 flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="display text-xl leading-tight">{t.name}</span>
              <span className="mt-1 text-sm text-muted-foreground">{t.tagline}</span>
              <span className="mt-auto pt-3 text-xs font-medium text-saffron">
                <span className="num">{count}</span> rule{count === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">No rules yet. Rules appear here as cards, in the order they are checked.</p>
        <Button variant="outline" size="lg" className="min-h-11" onClick={onAddRule}>
          <PenLine data-icon="inline-start" /> Or add a rule by hand
        </Button>
      </div>
    </section>
  );
}
