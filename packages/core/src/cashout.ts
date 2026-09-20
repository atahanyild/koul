import { KoulReader, type FiredEvent } from "./read";

export interface CashOutReady { ready: boolean; idleUsdc: bigint; trigger: FiredEvent | null }

/** A withdrawal rule only moves USDC into the wallet; cash out still needs the user's passkey. */
export async function readReadyToCashOut(reader: KoulReader, user: string, startLedger: number, threshold: bigint, accountId?: bigint): Promise<CashOutReady> {
  if (threshold <= 0n) throw new Error("threshold must be positive");
  const [portfolio, events] = await Promise.all([reader.readPortfolio(user, accountId), reader.readFired(user, startLedger)]);
  const trigger = events.filter((event) => event.kind === "withdraw").at(-1) ?? null;
  return { ready: trigger !== null && portfolio.idleUsdc >= threshold, idleUsdc: portfolio.idleUsdc, trigger };
}
