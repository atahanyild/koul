import { Address, contract, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { createDefaultContext, createEd25519Signer, type SmartAccountKit } from "smart-account-kit";
import { encodeAutopilot } from "./codec";
import { permissionsFor } from "./permissions";
import type { KoulConfig } from "./read";
import type { Autopilot } from "./schema";

export interface KoulWriteConfig extends KoulConfig { policy: string; ed25519Verifier: string; spoke: number }
type Call = (args: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>;
type Controller = { supply: Call; withdraw: Call; borrow: Call };
const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const addr = (s: string) => new Address(s).toScVal();

export class KoulWriter {
  constructor(readonly config: KoulWriteConfig) {}
  private options() { return { rpcUrl: this.config.rpcUrl, networkPassphrase: this.config.networkPassphrase, publicKey: this.config.publicKey }; }
  private controller(): Promise<Controller> { return contract.Client.from({ contractId: this.config.controller, ...this.options() }) as unknown as Promise<Controller>; }
  private key(hub: number) { return { asset: this.config.usdc, hub_id: hub }; }
  private build<T>(contractId: string, method: string, args: xdr.ScVal[], parseResultXdr: (v: xdr.ScVal) => T): Promise<contract.AssembledTransaction<T>> {
    return contract.AssembledTransaction.build<T>({ method, args, contractId, ...this.options(), parseResultXdr });
  }

  buildSetAutopilot(user: string, id: number, autopilot: Autopilot): Promise<contract.AssembledTransaction<null>> {
    return this.build(this.config.router, "set_autopilot", [addr(user), xdr.ScVal.scvU32(id), encodeAutopilot(autopilot)], () => null);
  }
  buildClearAutopilot(user: string, id: number): Promise<contract.AssembledTransaction<null>> {
    return this.build(this.config.router, "clear_autopilot", [addr(user), xdr.ScVal.scvU32(id)], () => null);
  }

  /** Returns the unsigned kit transaction. The frontend submits it with kit.signAndSubmit. */
  async buildGrantAgent(kit: SmartAccountKit, ap: Autopilot, agentRawPublicKey: Uint8Array, days: number, name: string, maxCalls = 40, windowLedgers = 2000): Promise<contract.AssembledTransaction<unknown>> {
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("days must be 1..30");
    const perms = permissionsFor(ap, this.config);
    const params = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: sym("account_id"), val: nativeToScVal(BigInt(ap.account_id), { type: "u64" }) }),
      new xdr.ScMapEntry({ key: sym("allowed_calls"), val: xdr.ScVal.scvVec(perms.allowedCalls.map(([id, fn]) => xdr.ScVal.scvVec([addr(id), sym(fn)]))) }),
      new xdr.ScMapEntry({ key: sym("allowed_transfer_recipients"), val: xdr.ScVal.scvVec(perms.transferRecipients.map(addr)) }),
      new xdr.ScMapEntry({ key: sym("max_calls_per_window"), val: xdr.ScVal.scvU32(maxCalls) }),
      new xdr.ScMapEntry({ key: sym("window_ledgers"), val: xdr.ScVal.scvU32(windowLedgers) }),
    ]);
    const ledger = (await kit.rpc.getLatestLedger()).sequence;
    const signer = createEd25519Signer(this.config.ed25519Verifier, agentRawPublicKey);
    return kit.rules.add(createDefaultContext(), name, [signer], new Map([[this.config.policy, params]]), ledger + days * 17280);
  }
  buildRevokeAgent(kit: SmartAccountKit, ruleId: number): Promise<contract.AssembledTransaction<unknown>> {
    return kit.rules.remove(ruleId);
  }
  async buildSupply(user: string, accountId: bigint, hub: number, amount: bigint): Promise<contract.AssembledTransaction<unknown>> {
    if (amount <= 0n) throw new Error("amount must be positive");
    return (await this.controller()).supply({ caller: user, account_id: accountId, spoke_id: this.config.spoke, assets: [[this.key(hub), amount]] });
  }
  async buildWithdraw(user: string, accountId: bigint, hub: number, amount: bigint): Promise<contract.AssembledTransaction<unknown>> {
    if (amount <= 0n) throw new Error("amount must be positive");
    return (await this.controller()).withdraw({ caller: user, account_id: accountId, withdrawals: [[this.key(hub), amount]], to: user });
  }
  async buildBorrow(user: string, accountId: bigint, hub: number, amount: bigint): Promise<contract.AssembledTransaction<unknown>> {
    if (amount <= 0n) throw new Error("amount must be positive");
    return (await this.controller()).borrow({ caller: user, account_id: accountId, borrows: [[this.key(hub), amount]], to: user });
  }
  buildTransfer(from: string, to: string, amount: bigint): Promise<contract.AssembledTransaction<null>> {
    if (amount <= 0n) throw new Error("amount must be positive");
    return this.build(this.config.usdc, "transfer", [addr(from), addr(to), nativeToScVal(amount, { type: "i128" })], () => null);
  }
}
