"use client";

/**
 * Home: understood in ten seconds, works fully without a wallet. Hero and calculator side by side on desktop,
 * then the live pools, the autopilot templates and how it works. On phones the primary action follows the thumb.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { PrimaryCta, StickyCta } from "@/components/home/cta";
import { EarningsCalculator } from "@/components/home/calculator";
import { PoolCards } from "@/components/home/pool-cards";
import { TemplateCards } from "@/components/home/templates";
import { HowItWorks } from "@/components/home/how-it-works";
import { useInView } from "@/components/home/hooks";

export default function HomePage() {
  const heroCta = React.useRef<HTMLDivElement>(null);
  const ctaInView = useInView(heroCta);
  const scrollToHow = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const el = document.getElementById("how-it-works");
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <section className="mb-10 grid gap-8 sm:mb-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <div className="min-w-0">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Koul · a portfolio autopilot on Stellar</div>
          <h1 className="display text-[2.75rem] leading-[1.02] tracking-tight sm:text-[3.5rem] lg:text-[4rem]">
            Your lira, earning in <em className="display-italic">dollars</em>.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Bring lira in through your bank, hold USDC in the pool that pays more, and let rules you can read look after it.
          </p>
          <div ref={heroCta} className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryCta />
            <Button variant="outline" size="lg" className="min-h-12 px-5 text-[15px]" nativeButton={false} render={<a href="#how-it-works" onClick={scrollToHow} />}>
              How it works
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No seed phrase. Your money stays in your own wallet. Testnet fees are covered.</p>
        </div>
        <EarningsCalculator />
      </section>

      <PoolCards />
      <TemplateCards />
      <HowItWorks />

      <StickyCta show={!ctaInView} />
    </>
  );
}
