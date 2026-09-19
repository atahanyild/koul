/** Niet testnet deployment and helpers shared by the experimental frontend. */
import { Address, xdr } from "@stellar/stellar-sdk";

export const NIET = {
  router: process.env.NEXT_PUBLIC_NIET_ROUTER ?? "CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P",
  policy: process.env.NEXT_PUBLIC_NIET_POLICY ?? "CCEYSMIWTRJL7GE6G4MVKEC4NONUCTYVMZKMQH7D3PTQ7DPBLU5V3X4O",
  oracle: process.env.NEXT_PUBLIC_NIET_ORACLE ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  /** The keeper's agent Ed25519 public key (G-address form). Only ever a public key in the browser. */
  agentPublicKey: process.env.NEXT_PUBLIC_NIET_AGENT_PUBLIC_KEY ?? "GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export const XOXNO = {
  controller: "CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3",
  pool: "CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  spoke: 3,
} as const;

export const LEDGERS_PER_DAY = 17280;
export const ORACLE_DECIMALS = 14;

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const addr = (a: string) => new Address(a).toScVal();

/** What the agent may do with this wallet. Everything else is rejected on-chain by niet_agent_policy. */
export const AGENT_ALLOWED_CALLS: [string, string][] = [
  [NIET.router, "tick"],
  [XOXNO.controller, "withdraw"],
  [XOXNO.controller, "supply"],
  [XOXNO.controller, "repay"],
  [XOXNO.usdc, "transfer"],
];
export const AGENT_TRANSFER_RECIPIENTS = [XOXNO.pool];

/** `NietAgentParams` for the policy install, keys in the order the contract type sorts them. */
export function agentPolicyParams(maxCalls = 40, windowLedgers = 2000): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym("allowed_calls"), val: xdr.ScVal.scvVec(AGENT_ALLOWED_CALLS.map(([c, f]) => xdr.ScVal.scvVec([addr(c), sym(f)]))) }),
    new xdr.ScMapEntry({ key: sym("allowed_transfer_recipients"), val: xdr.ScVal.scvVec(AGENT_TRANSFER_RECIPIENTS.map(addr)) }),
    new xdr.ScMapEntry({ key: sym("max_calls_per_window"), val: xdr.ScVal.scvU32(maxCalls) }),
    new xdr.ScMapEntry({ key: sym("window_ledgers"), val: xdr.ScVal.scvU32(windowLedgers) }),
  ]);
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const explorerTx = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;

/** USD per TRY with 14 decimals -> TRY per USD, as people read it. */
export function usdPerTryToTryPerUsd(price: bigint): number {
  return price === 0n ? 0 : 10 ** ORACLE_DECIMALS / Number(price);
}
export function tryPerUsdToUsdPerTry(tryPerUsd: number): bigint {
  return BigInt(Math.round((10 ** ORACLE_DECIMALS) / tryPerUsd));
}
