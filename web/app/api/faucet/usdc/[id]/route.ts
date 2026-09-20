import { fundsEnabled } from "@/lib/funds-server";
import { getFaucetTransfer } from "@/lib/usdc-faucet-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Testnet funding is disabled in production" }, { status: 503 });
  try { return Response.json(await getFaucetTransfer((await params).id)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Faucet status failed";
    return Response.json({ error: message }, { status: message === "Unknown faucet transfer ID" ? 404 : 400 });
  }
}
