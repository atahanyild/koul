import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Address, Asset, BASE_FEE, Contract, Keypair, TransactionBuilder, rpc, scValToNative } from "@stellar/stellar-sdk";
import { createLandingAccount, submitPreauthorized, type LandingPlan, type LandingDeps } from "@koul/core/anchor/landing";
import { localFeeBumpRelay } from "@koul/core/anchor/local-relay";
import { XOXNO } from "@/lib/koul";

const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const AMOUNT = 20_0000000n;
const directory = process.env.FAUCET_STATE_DIR ?? join(process.cwd(), ".faucet-state");

interface FaucetRecord {
  id: string;
  wallet: string;
  plan: LandingPlan;
  status: "waiting" | "forwarding" | "completed";
  forwardHash?: string;
  cleanupHash?: string;
}

function pathFor(id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid faucet transfer ID");
  return join(directory, `${id}.json`);
}

async function load(id: string): Promise<FaucetRecord> {
  try { return JSON.parse(await readFile(pathFor(id), "utf8")) as FaucetRecord; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("Unknown faucet transfer ID");
    throw error;
  }
}

async function save(record: FaucetRecord): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, `${record.id}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(record), { mode: 0o600 });
  await rename(temp, pathFor(record.id));
}

function deps(): LandingDeps {
  const secret = process.env.KEEPER_SECRET;
  if (!secret) throw new Error("KEEPER_SECRET is required for test USDC funding");
  const sponsor = Keypair.fromSecret(secret);
  const server = new rpc.Server(process.env.RPC_URL ?? "https://soroban-testnet.stellar.org");
  const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
  return { sponsor, server, networkPassphrase, relay: localFeeBumpRelay(server, sponsor, networkPassphrase) };
}

async function usdcBalance(d: LandingDeps, address: string): Promise<bigint> {
  const source = await d.server.getAccount(d.sponsor.publicKey());
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: d.networkPassphrase })
    .addOperation(new Contract(XOXNO.usdc).call("balance", Address.fromString(address).toScVal()))
    .setTimeout(30).build();
  const sim = await d.server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Error("Could not read faucet address balance");
  return scValToNative(sim.result!.retval) as bigint;
}

function publicRecord(record: FaucetRecord) {
  return { transferId: record.id, wallet: record.wallet, landingAccount: record.plan.publicKey,
    amountUsdc: "20", status: record.status, forwardHash: record.forwardHash, cleanupHash: record.cleanupHash };
}

export async function createFaucetTransfer(wallet: string) {
  if (!/^C[A-Z2-7]{55}$/.test(wallet)) throw new Error("A Stellar smart-wallet address is required");
  Address.fromString(wallet);
  const plan = await createLandingAccount(deps(), {
    usdc: new Asset("USDC", USDC_ISSUER), usdcContract: XOXNO.usdc,
    kind: { type: "onramp", destinationContract: wallet, amountStroops: AMOUNT },
    abortable: true,
  });
  const record: FaucetRecord = { id: randomUUID(), wallet, plan, status: "waiting" };
  await save(record);
  return publicRecord(record);
}

const pending = new Map<string, Promise<ReturnType<typeof publicRecord>>>();
export async function getFaucetTransfer(id: string) {
  const active = pending.get(id);
  if (active) return active;
  const job = advance(id);
  pending.set(id, job);
  try { return await job; } finally { pending.delete(id); }
}

async function advance(id: string) {
  const record = await load(id);
  if (record.status === "completed") return publicRecord(record);
  const d = deps();
  if (!record.forwardHash) {
    if (await usdcBalance(d, record.plan.publicKey) < AMOUNT) return publicRecord(record);
    record.status = "forwarding";
    await save(record);
    const result = await submitPreauthorized(d, record.plan.forwardTxXdr);
    record.forwardHash = result.hash;
    await save(record);
  }
  if (!record.cleanupHash) {
    const result = await submitPreauthorized(d, record.plan.cleanupTxXdr);
    record.cleanupHash = result.hash;
    await save(record);
  }
  record.status = "completed";
  await save(record);
  return publicRecord(record);
}
