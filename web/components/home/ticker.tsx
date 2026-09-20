"use client";

/** A slow marquee of the plain facts, in the small-caps mono voice, the way Sembol runs its strip under the hero. */
import { motion, useReducedMotion } from "motion/react";

const FACTS = [
  "Non-custodial",
  "Rules stored on Stellar",
  "Evaluated by a contract",
  "Passkey, no seed phrase",
  "Agent key expires",
  "XOXNO lending",
  "Lira in and out",
  "Testnet fees covered",
];

export function FactsTicker() {
  const reduced = useReducedMotion();
  const items = [...FACTS, ...FACTS];
  return (
    <div className="relative mb-12 overflow-hidden border-y border-border py-3 sm:mb-16" aria-hidden>
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap"
        animate={reduced ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: 38, ease: "linear", repeat: Infinity }}
      >
        {items.map((f, i) => (
          <span key={`${f}-${i}`} className="label flex items-center gap-10 text-muted-foreground">
            {f}
            <span className="size-1 rounded-full bg-saffron/60" />
          </span>
        ))}
      </motion.div>
    </div>
  );
}
