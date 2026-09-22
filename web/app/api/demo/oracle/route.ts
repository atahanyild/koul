/**
 * Demo only: moves the mock USD/TRY price through the oracle admin app's route, server to server, so the browser
 * never holds a secret. Off unless NEXT_PUBLIC_KOUL_DEMO=1, and never on a network other than testnet.
 */
import { NextResponse } from "next/server";
import { KOUL } from "@/lib/koul";

const ADMIN = process.env.KOUL_ORACLE_ADMIN_URL ?? "https://koul-oracle.vercel.app";
const enabled = () => process.env.NEXT_PUBLIC_KOUL_DEMO === "1" && KOUL.networkPassphrase === "Test SDF Network ; September 2015";

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "Demo is off" }, { status: 404 });
  const r = await fetch(`${ADMIN}/api/oracle`, { cache: "no-store" });
  return NextResponse.json(await r.json(), { status: r.status });
}

/** Body: { tryPerUsd: 48.79, stale?: true }. The oracle stores USD per TRY with 14 decimals. */
export async function POST(req: Request) {
  if (!enabled()) return NextResponse.json({ error: "Demo is off" }, { status: 404 });
  const body = (await req.json()) as { tryPerUsd?: number; stale?: boolean };
  if (!body.tryPerUsd || !(body.tryPerUsd > 0)) return NextResponse.json({ error: "tryPerUsd must be positive" }, { status: 400 });
  const price = BigInt(Math.round(1e14 / body.tryPerUsd)).toString();
  const payload: Record<string, unknown> = { price };
  if (body.stale) payload.timestamp = Math.floor(Date.now() / 1000) - 1800;
  const r = await fetch(`${ADMIN}/api/oracle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
  return NextResponse.json(await r.json(), { status: r.status });
}
