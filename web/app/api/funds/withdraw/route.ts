import { fundsEnabled, fundsService } from "@/lib/funds-server";

/** Returns an unsigned SAC transfer; the user signs it with a passkey. */
export async function POST(request: Request): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try {
    const body = await request.json() as { wallet?: string; amountUsdc?: string; iban?: string; customer?: Record<string, string> };
    if (!body.wallet || !body.amountUsdc || !body.iban || !body.customer) return Response.json({ error: "wallet, amountUsdc, iban and customer are required" }, { status: 400 });
    return Response.json(await fundsService().createWithdrawal({ wallet: body.wallet, amountUsdc: body.amountUsdc, iban: body.iban, customer: body.customer }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Withdrawal setup failed" }, { status: 400 });
  }
}
