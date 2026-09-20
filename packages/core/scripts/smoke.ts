/**
 * Live smoke test of @koul/core against testnet, read-only plus one simulated (unsigned) write:
 * readPortfolio, readOracle, checkAutopilot, simulateTick, readFired, buildSetAutopilot (simulation only).
 *   pnpm smoke [wallet]
 */
import { KoulReader, KoulWriter, liraShield, validateAutopilot, decodeAutopilot, encodeAutopilot } from "../src/index.js";

const wallet = process.argv[2] ?? "CBHMG4IGCLP36WJUMYR55N2TGDSZ4C5V6YQSBT4HWT6A77DCL3Y7UUFL";
const config = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  publicKey: "GAFHZTSL63YZYU35SCHDOGOMXQ25266DBQYG7KETG6HC2AHBIZMGXP6U",
  router: "CBHRTWXARGZCUDBE7IX4SZV7GDFA6PRQICZQPUSOUPN3YDCVPXQBMT2P",
  oracle: "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2",
  controller: "CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3",
  pool: "CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  xlm: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  policy: "CBDQPSGJDJUGLUIYTLAVH7C7FQE3ZN2HXOKYELNPEEUHFPV52QRI5AR2",
  ed25519Verifier: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
  spoke: 3,
};
const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const t0 = Date.now();
const lap = (label: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const reader = new KoulReader(config);
const p = await reader.readPortfolio(wallet);
lap(`readPortfolio: account ${p.accountId} idle ${p.idleUsdc} xlm ${p.xlm} hf ${p.healthFactor} hubs ${j(p.hubs.map((h) => ({ hub: h.hub, coll: h.collateral, debt: h.debt, rate: h.depositRate, util: h.utilisation })))}`);
const nft = await reader.readPositionNft(wallet);
lap(`readPositionNft: ${j(nft)}`);
const o = await reader.readOracle("TRY");
lap(`readOracle: ${j(o)}`);
const st = await reader.checkAutopilot(wallet, 1);
lap(`checkAutopilot: ${j(st)}`);
const ex = await reader.simulateTick(wallet, 1);
lap(`simulateTick: ${j(ex)}`);
const latest = await (reader as unknown as { server: { getLatestLedger: () => Promise<{ sequence: number }> } }).server.getLatestLedger();
const fired = await reader.readFired(wallet, latest.sequence - 17280, 20);
lap(`readFired (last day): ${fired.length} events ${j(fired.map((f) => ({ ledger: f.ledger, kind: f.kind, rule: f.rule_index, amount: f.amount, tx: f.txHash.slice(0, 8) })))}`);

const ap = liraShield(String(p.accountId ?? 12));
const v = validateAutopilot(ap);
lap(`validateAutopilot(liraShield): ${j(v)}`);
const back = decodeAutopilot(encodeAutopilot(ap));
lap(`codec round trip equal: ${j(back) === j(ap)}`);
const writer = new KoulWriter(config);
const tx = await writer.buildSetAutopilot(wallet, 1, ap);
const sim = (tx as { simulation?: { error?: string } }).simulation;
lap(`buildSetAutopilot simulated: ${sim && !("error" in sim && sim.error) ? "ok" : `error ${sim?.error}`}; auth entries: ${(tx.built?.operations[0] as { auth?: unknown[] } | undefined)?.auth?.length}`);
const w = await writer.buildWithdraw(wallet, p.accountId ?? 12n, 2, 10_000_000n);
const wsim = (w as { simulation?: { error?: string } }).simulation;
lap(`buildWithdraw simulated: ${wsim && !("error" in wsim && wsim.error) ? "ok" : `error ${String(wsim?.error).slice(0, 160)}`}`);
