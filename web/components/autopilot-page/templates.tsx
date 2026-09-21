"use client";

/** "Or start from a template": three rules the router runs well, one tap each. */
import { PillButton, Tile } from "@/components/signal";
import { makeRule, type Rule } from "@/lib/model/autopilot";
import { actionShort, conditionsCompact } from "@/lib/model/labels";

export const TEMPLATE_RULES: { id: string; title: string; make: () => Rule }[] = [
  { id: "repay", title: "Repay before liquidation", make: () => makeRule({ name: "Repay debt", conditions: [{ kind: "health_factor", comparator: "lte", value: 1.25 }], action: { kind: "repay_from_wallet", amount: "all" }, cooldownSec: 600 }) },
  { id: "exit", title: "Exit on lira shock", make: () => makeRule({ name: "Lira exit", conditions: [{ kind: "fx_price", comparator: "gte", value: 50 }], action: { kind: "withdraw_to_wallet", amount: "all" }, cooldownSec: 600 }) },
  { id: "rate", title: "Chase the better rate", make: () => makeRule({ name: "Best rate", conditions: [{ kind: "rate_gap", comparator: "gte", value: 1 }], action: { kind: "move_to_best_pool", amount: "all" }, cooldownSec: 3600 }) },
];

export function Templates({ onAdd }: { onAdd: (rule: Rule) => void }) {
  return (
    <div className="grid gap-3">
      <h2 className="px-2 text-[22px] font-bold">Or start from a template</h2>
      <div className="grid gap-4 md:grid-cols-3 md:gap-5">
        {TEMPLATE_RULES.map((t) => {
          const rule = t.make();
          return (
            <Tile key={t.id} className="flex flex-col gap-4">
              <div className="text-[20px] font-bold">{t.title}</div>
              <div className="mono text-muted"><span className="text-muted">IF</span> {conditionsCompact(rule)} <span className="text-accent-text">→</span> {actionShort(rule.action)}</div>
              <div className="mt-auto"><PillButton variant="ghost" size="md" onClick={() => onAdd(t.make())}>Add</PillButton></div>
            </Tile>
          );
        })}
      </div>
    </div>
  );
}
