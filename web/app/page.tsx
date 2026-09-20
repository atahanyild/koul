"use client";

/**
 * Home: understood in ten seconds, works fully without a wallet. Hero, the XOXNO markets, the autopilot templates
 * and how it works. On phones the primary action follows the thumb.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { PrimaryCta, StickyCta } from "@/components/home/cta";
import { PoolCards } from "@/components/home/pool-cards";
import { TemplateCards } from "@/components/home/templates";
import { HowItWorks } from "@/components/home/how-it-works";
import { FactsTicker } from "@/components/home/ticker";
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
      <section className="mb-12 sm:mb-16">
        <div className="max-w-3xl">
          <div className="label mb-4 text-muted-foreground">Koul · conditional execution on Stellar</div>
          <h1 className="display-hero text-[3rem] sm:text-[4.25rem] lg:text-[5.25rem]">
            Your rules,<br />executed <span className="text-saffron">on-chain</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Say what should happen to your position and when. Koul stores it as rules on Stellar and runs them against XOXNO lending from your own wallet, with a key that can only do what you allowed.
          </p>
          <div ref={heroCta} className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryCta />
            <Button variant="outline" size="lg" className="min-h-12 px-5 text-[15px]" nativeButton={false} render={<a href="#how-it-works" onClick={scrollToHow} />}>
              How it works
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No seed phrase, no custody. Every decision is a contract call you can read on the explorer. Testnet fees are covered.</p>
        </div>
      </section>

      <FactsTicker />
      <PoolCards />
      <TemplateCards />
      <HowItWorks />

      <StickyCta show={!ctaInView} />
    </>
  );
}
