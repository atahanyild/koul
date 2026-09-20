import "server-only";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair, rpc } from "@stellar/stellar-sdk";
import { localFeeBumpRelay } from "@koul/core/anchor/local-relay";
import { FundsService } from "@koul/core/funds";
import { FileFundsStore } from "@koul/core/funds-file-store";

export function fundsService(): FundsService {
  const secret = process.env.KEEPER_SECRET;
  if (!secret) throw new Error("KEEPER_SECRET is required for Funds routes");
  const sponsor = Keypair.fromSecret(secret);
  const rpcUrl = process.env.RPC_URL ?? "https://soroban-testnet.stellar.org";
  const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
  const domain = (process.env.ANCHOR_HOME_DOMAINS ?? "tr-mock-anchor.fly.dev").split(",")[0]!.trim();
  const server = new rpc.Server(rpcUrl);
  // The working directory is read-only on a serverless host; the temp directory is the only place a file can go.
  const store = new FileFundsStore(process.env.FUNDS_STATE_DIR ?? join(tmpdir(), "koul-funds"));
  return new FundsService({ server, sponsor, networkPassphrase, relay: localFeeBumpRelay(server, sponsor, networkPassphrase) }, store, domain);
}

export function fundsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.FUNDS_ALLOW_PRODUCTION === "1";
}
