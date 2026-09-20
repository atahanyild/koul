/** Shared wiring for the keeper and its scripts: testnet constants, env, state file, kit factory. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { MemoryStorage, SmartAccountKit } from "smart-account-kit";
import { SoftwareAuthenticator, type AuthenticatorState } from "../phase0/passkey";

export const TESTNET = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  accountWasmHash: "1b5f4534a76322da2ad7c745f6900857a6802b0ca79850c35a03561df997785a",
  webauthnVerifierAddress: "CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F",
  ed25519VerifierAddress: "CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4",
  xlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;
export const XOXNO = {
  controller: "CCXRWJ6SIU2WPFEGLFGJVITPL57QAYIMIO6OAM2NBGNDQSSCK2FFV3F3",
  pool: "CBSGF6QOQAMPFBEVSYPEQHSZRIHJ6RCGUPCRDMUX36DEKRWFAO2PZB5A",
  usdc: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  spoke: 3,
} as const;
export const RP_ID = "koul.local";
export const ORIGIN = "https://koul.local";
export const LEDGERS_PER_DAY = 17280;

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const STATE_PATH = `${ROOT}.phase0-state.json`;

export function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(`${ROOT}.env`, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export interface State {
  contractId?: string;
  passkey?: AuthenticatorState;
  ruleId?: number;
  agentRuleId?: number;
  t4?: { accountId?: string };
  [k: string]: unknown;
}
export function loadState(): State {
  return existsSync(STATE_PATH) ? (JSON.parse(readFileSync(STATE_PATH, "utf8")) as State) : {};
}
export function saveState(s: State): void {
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

export const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
export const step = (s: string) => console.log(`\n== ${s}`);
export const sym = (s: string) => xdr.ScVal.scvSymbol(s);
export const addr = (a: string) => new Address(a).toScVal();

export class ForbiddenAuthenticator extends SoftwareAuthenticator {
  override async startAuthentication(): Promise<never> { throw new Error("PASSKEY WAS TOUCHED: the keeper must be agent-only"); }
  override async startRegistration(): Promise<never> { throw new Error("PASSKEY WAS TOUCHED"); }
}

export function makeKit(env: Record<string, string>, authenticator: SoftwareAuthenticator): SmartAccountKit {
  return new SmartAccountKit({
    rpcUrl: TESTNET.rpcUrl, networkPassphrase: TESTNET.networkPassphrase, accountWasmHash: TESTNET.accountWasmHash,
    webauthnVerifierAddress: TESTNET.webauthnVerifierAddress, ed25519VerifierAddress: TESTNET.ed25519VerifierAddress,
    storage: new MemoryStorage(), rpId: RP_ID, rpName: "Koul",
    webAuthn: authenticator as unknown as NonNullable<ConstructorParameters<typeof SmartAccountKit>[0]["webAuthn"]>,
    deployerSecret: env.KEEPER_SECRET!, timeoutInSeconds: 60,
  });
}

/** One context_rule_id per context: root invocation plus every sub-invocation. */
export function countContexts(inv: xdr.SorobanAuthorizedInvocation): number {
  return 1 + inv.subInvocations().reduce((acc, sub) => acc + countContexts(sub), 0);
}

export function describeEntries(entries: xdr.SorobanAuthorizationEntry[]): string[] {
  const walk = (inv: xdr.SorobanAuthorizedInvocation, depth: number): string[] => {
    const f = inv.function();
    const line = f.switch().name === "sorobanAuthorizedFunctionTypeContractFn"
      ? `${"  ".repeat(depth)}${Address.fromScAddress(f.contractFn().contractAddress()).toString().slice(0, 8)}.${f.contractFn().functionName().toString()}`
      : `${"  ".repeat(depth)}<create>`;
    return [line, ...inv.subInvocations().flatMap((s) => walk(s, depth + 1))];
  };
  return entries.map((e) => {
    const cred = e.credentials().switch().name;
    const who = cred === "sorobanCredentialsAddress" ? Address.fromScAddress(e.credentials().address().address()).toString().slice(0, 8) : "source";
    return `[${who}] ` + walk(e.rootInvocation(), 0).join(" > ");
  });
}

/** `KoulAgentParams` as the kit expects it for a custom policy: a hand-built ScVal map, keys in sorted order. */
export function policyParams(p: { accountId: bigint; allowedCalls: [string, string][]; recipients: string[]; maxCalls: number; windowLedgers: number }): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: sym("account_id"), val: nativeToScVal(p.accountId, { type: "u64" }) }),
    new xdr.ScMapEntry({ key: sym("allowed_calls"), val: xdr.ScVal.scvVec(p.allowedCalls.map(([c, f]) => xdr.ScVal.scvVec([addr(c), sym(f)]))) }),
    new xdr.ScMapEntry({ key: sym("allowed_transfer_recipients"), val: xdr.ScVal.scvVec(p.recipients.map(addr)) }),
    new xdr.ScMapEntry({ key: sym("max_calls_per_window"), val: xdr.ScVal.scvU32(p.maxCalls) }),
    new xdr.ScMapEntry({ key: sym("window_ledgers"), val: xdr.ScVal.scvU32(p.windowLedgers) }),
  ]);
}

export const agentKeypair = (env: Record<string, string>) => Keypair.fromSecret(env.AGENT_SECRET!);
export const keeperKeypair = (env: Record<string, string>) => Keypair.fromSecret(env.KEEPER_SECRET!);
