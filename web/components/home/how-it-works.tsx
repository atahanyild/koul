"use client";

/** Three steps in plain words, the technical version one tap away on each. */
import { Section, Term } from "@/components/koul/primitives";

const STEPS: { n: string; text: React.ReactNode }[] = [
  {
    n: "1",
    text: (
      <>
        Face ID creates{" "}
        <Term detail="OpenZeppelin smart account deployed with a WebAuthn (secp256r1) passkey as rule 0. There is no seed phrase to lose.">your wallet</Term>, nothing to write down.
      </>
    ),
  },
  {
    n: "2",
    text: (
      <>
        Lira in through{" "}
        <Term detail="SEP-6 deposit-exchange with a SEP-38 firm quote at the anchor; funds land on an ownerless landing account that forwards to the smart account and merges itself away.">the bank partner</Term>, USDC in your wallet.
      </>
    ),
  },
  {
    n: "3",
    text: (
      <>
        Rules run on-chain;{" "}
        <Term detail="koul_router.tick evaluates the stored rules. The keeper's Ed25519 key is bound to koul_agent_policy: five allowlisted calls, transfers only to the XOXNO pool, rate-limited, expiring.">Koul&rsquo;s key</Term> can only do what you allowed.
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <div id="how-it-works" className="scroll-mt-20">
      <Section title="How it works" description="Your money stays in your own wallet the whole time.">
        <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 md:flex-col md:gap-3">
              <span className="display shrink-0 text-[2rem] leading-none text-clay md:text-[2.5rem]" aria-hidden>{s.n}</span>
              <p className="text-sm leading-relaxed sm:text-[15px]">
                <span className="sr-only">Step {s.n}. </span>
                {s.text}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
