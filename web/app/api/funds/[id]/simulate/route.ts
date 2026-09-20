import { fundsEnabled, fundsService } from "@/lib/funds-server";

/** Sandbox only: simulate the user's bank leg of a deposit so the demo does not wait on a real FAST transfer. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try { return Response.json(await fundsService().simulateBankTransfer((await params).id)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Simulation failed";
    return Response.json({ error: message }, { status: message === "Unknown transfer ID" ? 404 : 400 });
  }
}
