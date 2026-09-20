import { fundsEnabled, fundsService } from "@/lib/funds-server";

/** The sandbox bank leg is one call to the anchor, but it queues behind the anchor watcher. The default function limit is too short for it. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Sandbox only: simulate the user's bank leg of a deposit so the demo does not wait on a real FAST transfer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try {
    const state = request.headers.get("x-koul-transfer-state") ?? undefined;
    return Response.json(await fundsService().simulateBankTransfer((await params).id, state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation failed";
    return Response.json({ error: message }, { status: message === "Unknown transfer ID" ? 404 : 400 });
  }
}
