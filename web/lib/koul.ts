/** Koul testnet deployment and the SDK configuration the app reads and writes through. */
import { XOXNO_POSITION_NFT, type KoulConfig, type KoulWriteConfig } from "@koul/core";

export const KOUL = {
  router: process.env.NEXT_PUBLIC_KOUL_ROUTER ?? "CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P",
  policy: process.env.NEXT_PUBLIC_KOUL_POLICY ?? "CBDQPSGJDJUGLUIYTLAVH7C7FQE3ZN2HXOKYELNPEEUHFPV52QRI5AR2",
  oracle: process.env.NEXT_PUBLIC_KOUL_ORACLE ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  /** The keeper's agent Ed25519 public key (G-address form). Only ever a public key in the browser. */
  agentPublicKey: process.env.NEXT_PUBLIC_KOUL_AGENT_PUBLIC_KEY ?? "GBVD753EJMRQYI6WQCWC4OMDCNMGQMHXRT7IOAHTT3FD7ON6OQXTSAK3",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  ed25519Verifier: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
} as const;

export const XOXNO = {
  controller: "CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3",
  pool: "CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  positionNft: XOXNO_POSITION_NFT,
  spoke: 3,
} as const;

export const LEDGERS_PER_DAY = 17280;
export const LEDGER_SECONDS = 5;
export const ORACLE_DECIMALS = 14;
/** Rules reject oracle prices older than this. */
export const MAX_PRICE_AGE_SECS = 900;

/** The keeper's G-account: public, funded, used only as a simulation source for read-only contract calls. */
export const SIM_SOURCE = "GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U";

export const READ_CONFIG: KoulConfig = {
  rpcUrl: KOUL.rpcUrl,
  networkPassphrase: KOUL.networkPassphrase,
  publicKey: SIM_SOURCE,
  router: KOUL.router,
  oracle: KOUL.oracle,
  controller: XOXNO.controller,
  pool: XOXNO.pool,
  usdc: XOXNO.usdc,
  xlm: XOXNO.xlm,
  positionNft: XOXNO.positionNft,
  hubs: [1, 2],
};

export const WRITE_CONFIG: KoulWriteConfig = { ...READ_CONFIG, policy: KOUL.policy, ed25519Verifier: KOUL.ed25519Verifier, spoke: XOXNO.spoke };

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const explorerTx = (h: string) => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const explorerContract = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`;
export const explorerAccount = (id: string) => `https://stellar.expert/explorer/testnet/account/${id}`;

/** USD per TRY with 14 decimals -> TRY per USD, as people read it. */
export function usdPerTryToTryPerUsd(price: bigint): number {
  return price === 0n ? 0 : 10 ** ORACLE_DECIMALS / Number(price);
}
export function tryPerUsdToUsdPerTry(tryPerUsd: number): bigint {
  return BigInt(Math.round((10 ** ORACLE_DECIMALS) / tryPerUsd));
}
