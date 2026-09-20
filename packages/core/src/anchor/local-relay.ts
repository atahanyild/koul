/**
 * Fee-bump relay for landing-account envelopes, standing in for Kumbara's hosted relay: the keeper G-account wraps
 * the pre-authorized (already fully signed) envelope in a fee-bump transaction and pays the fee.
 */
import { Keypair, Transaction, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import type { RelaySubmitter } from "./landing";

export function localFeeBumpRelay(server: rpc.Server, payer: Keypair, networkPassphrase: string): RelaySubmitter {
  return {
    async sendXdr(envelopeXdr: string) {
      try {
        const inner = TransactionBuilder.fromXDR(envelopeXdr, networkPassphrase) as Transaction;
        const bump = TransactionBuilder.buildFeeBumpTransaction(payer, "1000000", inner, networkPassphrase);
        bump.sign(payer);
        const sent = await server.sendTransaction(bump);
        if (sent.status === "ERROR") {
          let code = "unknown";
          try { code = sent.errorResult?.result().switch().name ?? "unknown"; } catch { /* keep unknown */ }
          return { success: false, error: `fee-bump rejected: ${code}`, errorCode: code };
        }
        return { success: true, hash: sent.hash };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: "RELAY_UNREACHABLE" };
      }
    },
  };
}
