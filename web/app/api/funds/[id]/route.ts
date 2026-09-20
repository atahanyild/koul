import { fundsEnabled, fundsService } from "@/lib/funds-server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try { return Response.json(await fundsService().getStatus((await params).id)); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Transfer lookup failed";
    return Response.json({ error: message }, { status: message === "Unknown transfer ID" ? 404 : 400 });
  }
}
