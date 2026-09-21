"use client";

/**
 * The first screen and the not-connected state of every route: one lime tile that says what Koul is and offers
 * the two passkey actions, three steps beside it. Creating a wallet is one prompt; the button says what the device
 * is doing while it runs, and a dismissed prompt lands on a calm line with the button ready again.
 */
import { Label, PillButton, Tile } from "@/components/signal";
import { useWalletOnboarding, type PasskeyPhase } from "@/hooks/use-wallet";

const STEPS = [
  { n: "01", title: "Create a wallet", line: "One passkey prompt." },
  { n: "02", title: "Deposit", line: "Lira or crypto. It lands as USDC." },
  { n: "03", title: "Set your rules", line: "Koul watches and acts." },
];

const BUSY: Partial<Record<PasskeyPhase, string>> = {
  prompt: "Confirm with your passkey",
  deploying: "Creating your wallet",
  funding: "Adding test XLM",
  submitting: "Almost there",
};

export function Welcome() {
  const ob = useWalletOnboarding();
  const busy = ob.phase === "prompt" || ob.phase === "deploying" || ob.phase === "funding" || ob.phase === "submitting";
  const creating = busy && ob.mode === "create";
  const connecting = busy && ob.mode === "connect";

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-5">
      <Tile tone="lime" className="flex min-h-[560px] flex-col p-6 md:min-h-[672px] md:p-12">
        <p className="text-[16px] font-bold">Set the rules once. Koul does the rest.</p>
        <h1 className="t-headline mt-8 max-w-[11ch] md:mt-auto md:mb-auto">Your dollars on autopilot.</h1>
        <div className="mt-8 flex flex-col gap-3 md:mt-0 md:flex-row md:flex-wrap md:items-center md:gap-4">
          <PillButton variant="onLime" size="lg" disabled={busy} aria-busy={creating} onClick={() => void ob.run("create")}>
            {creating ? BUSY[ob.phase] : "Create wallet"}
          </PillButton>
          <PillButton variant="onLimeOutline" size="lg" disabled={busy} aria-busy={connecting} onClick={() => void ob.run("connect")}>
            {connecting ? BUSY[ob.phase] : "I have a wallet"}
          </PillButton>
          <Label tone="onLime" className="md:ml-2">Passkey · no seed phrase</Label>
        </div>
        <p role="status" aria-live="polite" className="label mt-4 min-h-5 text-on-lime">
          {ob.phase === "cancelled" && "Nothing was signed. Try again when you are ready."}
          {ob.phase === "error" && (ob.error?.code === "wallet_not_found" || /no wallet found/i.test(ob.error?.message ?? "") ? "No wallet for this passkey on this site. Wallets belong to the site that created them." : ob.error?.userMessage || ob.error?.message || "That did not work. Try again.")}
        </p>
      </Tile>
      <div className="grid gap-4 md:gap-5">
        {STEPS.map((s) => (
          <Tile key={s.n} className="flex min-h-[120px] items-center gap-6 md:min-h-0 md:flex-1">
            <span className="label shrink-0 text-lime">{s.n}</span>
            <div>
              <div className="text-[24px] font-bold leading-tight md:text-[28px]">{s.title}</div>
              <div className="mt-1 text-[15px] text-muted">{s.line}</div>
            </div>
          </Tile>
        ))}
      </div>
    </div>
  );
}
