import { fundsEnabled, fundsService } from "@/lib/funds-server";

/**
 * Advance a transfer. The sealed state from the previous answer travels in the `x-koul-transfer-state` header, so
 * any instance can carry the transfer on; without it the server falls back to its own record, which only works when
 * one process handles the whole transfer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try {
    const state = request.headers.get("x-koul-transfer-state") ?? undefined;
    return Response.json(await fundsService().getStatus((await params).id, state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transfer lookup failed";
    return Response.json({ error: message }, { status: message === "Unknown transfer ID" ? 404 : 400 });
  }
}
