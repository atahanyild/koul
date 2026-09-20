import { fundsEnabled, fundsService } from "@/lib/funds-server";

/** Reference local-demo endpoint: creating a landing account spends sponsor fees. */
export async function POST(request: Request): Promise<Response> {
  if (!fundsEnabled()) return Response.json({ error: "Funds routes are disabled in production" }, { status: 503 });
  try {
    const body = await request.json() as { wallet?: string; amountTry?: string; customer?: Record<string, string>; simulateSandboxBankTransfer?: boolean };
    if (!body.wallet || !body.amountTry || !body.customer) return Response.json({ error: "wallet, amountTry and customer are required" }, { status: 400 });
    const result = await fundsService().createDeposit({ wallet: body.wallet, amountTry: body.amountTry, customer: body.customer, simulateSandboxBankTransfer: body.simulateSandboxBankTransfer });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Deposit setup failed" }, { status: 400 });
  }
}
