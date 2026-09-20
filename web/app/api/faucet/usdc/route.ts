import { fundsEnabled } from "@/lib/funds-server";
import { createFaucetTransfer } from "@/lib/usdc-faucet-server";

/** Creates a sponsored G account with a USDC trustline for Circle's testnet faucet. */
export async function POST(request: Request): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Testnet funding is disabled in production" }, { status: 503 });
  try {
    const body = await request.json() as { wallet?: string };
    if (!body.wallet) return Response.json({ error: "wallet is required" }, { status: 400 });
    return Response.json(await createFaucetTransfer(body.wallet));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Faucet setup failed" }, { status: 400 });
  }
}
