/**
 * Oracle admin: the only server-side secret in this app. Sets the mock FX price on testnet with the oracle's
 * admin key. Never deployed with a real oracle; on mainnet the router reads Reflector and this route does not exist.
 */
import { Address, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";

const RPC = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASSPHRASE = process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const ORACLE = process.env.KOUL_ORACLE ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2";

const asset = (code: string) => xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(code)]);

export async function GET() {
  const server = new rpc.Server(RPC);
  const admin = process.env.ORACLE_ADMIN_SECRET ? Keypair.fromSecret(process.env.ORACLE_ADMIN_SECRET).publicKey() : null;
  const source = admin ?? "GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U";
  const acc = await server.getAccount(source);
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(new Contract(ORACLE).call("lastprice", asset("TRY"))).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) return NextResponse.json({ error: "simulation failed" }, { status: 500 });
  const v = scValToNative(sim.result!.retval) as { price: bigint; timestamp: bigint } | null;
  return NextResponse.json({ oracle: ORACLE, admin, price: v ? v.price.toString() : null, timestamp: v ? Number(v.timestamp) : null, now: Math.floor(Date.now() / 1000) });
}

export async function POST(req: Request) {
  const secret = process.env.ORACLE_ADMIN_SECRET;
  if (!secret) return NextResponse.json({ error: "ORACLE_ADMIN_SECRET is not set on the server" }, { status: 500 });
  const body = (await req.json()) as { price?: string; timestamp?: number; asset?: string };
  if (!body.price || !/^\d+$/.test(body.price)) return NextResponse.json({ error: "price must be an integer string (14 decimals)" }, { status: 400 });
  const admin = Keypair.fromSecret(secret);
  const server = new rpc.Server(RPC);
  const acc = await server.getAccount(admin.publicKey());
  const c = new Contract(ORACLE);
  const op = body.timestamp
    ? c.call("set_price_at", asset(body.asset ?? "TRY"), nativeToScVal(BigInt(body.price), { type: "i128" }), nativeToScVal(BigInt(body.timestamp), { type: "u64" }))
    : c.call("set_price", asset(body.asset ?? "TRY"), nativeToScVal(BigInt(body.price), { type: "i128" }));
  const built = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: PASSPHRASE }).addOperation(op).setTimeout(60).build();
  const prepared = await server.prepareTransaction(built);
  prepared.sign(admin);
  const sent = await server.sendTransaction(prepared);
  if (sent.status !== "PENDING") return NextResponse.json({ error: `send ${sent.status}` }, { status: 500 });
  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  void Address;
  return NextResponse.json({ hash: sent.hash, status: done.status });
}
