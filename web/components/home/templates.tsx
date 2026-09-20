"use client";

/** The three autopilot templates as cards, each rule folded into tiny when/do lines. */
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, CardLink } from "@/components/koul/primitives";
import { TEMPLATES, conditionSentence, actionSentence, type Rule } from "@/lib/model/autopilot";
import { fmtCooldown } from "@/lib/format";

export function TemplateCards() {
  // rules() mints ids; build them once per mount and never render the ids.
  const templates = React.useMemo(() => TEMPLATES.map((t) => ({ id: t.id, name: t.name, tagline: t.tagline, rules: t.rules() })), []);
  return (
    <Section
      title="Autopilots"
      description="Start from a template. Every line can be changed before you arm it."
      aside={
        <Link href="/autopilots/new" className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          Write your own <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {templates.map((t) => (
          <CardLink key={t.id} href={`/autopilots/new?template=${t.id}`} className="group flex min-w-0 flex-col">
            <div className="display text-2xl leading-tight">{t.name}</div>
            <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
            <ol className="mt-4 flex flex-1 flex-col gap-2">
              {t.rules.map((r, i) => (
                <RuleLines key={i} rule={r} />
              ))}
            </ol>
            <div className="mt-5 flex items-center gap-1 text-xs font-medium text-clay">
              Use this template <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </div>
          </CardLink>
        ))}
      </div>
    </Section>
  );
}

function RuleLines({ rule }: { rule: Rule }) {
  return (
    <li className="rounded-lg bg-surface-2/70 px-3 py-2 text-xs leading-relaxed">
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{rule.name}</div>
      {rule.conditions.map((c, i) => {
        const s = conditionSentence(c);
        return (
          <div key={i} className="grid grid-cols-[2.25rem_1fr] gap-x-1">
            <span className="text-muted-foreground">{i === 0 ? "when" : rule.match === "all" ? "and" : "or"}</span>
            <span>
              {s.subject} {s.verb} <span className="num">{s.value}</span>
            </span>
          </div>
        );
      })}
      <div className="grid grid-cols-[2.25rem_1fr] gap-x-1">
        <span className="text-muted-foreground">do</span>
        <span>
          {actionSentence(rule.action)}
          <span className="text-muted-foreground">
            , then wait <span className="num">{fmtCooldown(rule.cooldownSec)}</span>
          </span>
        </span>
      </div>
    </li>
  );
}
