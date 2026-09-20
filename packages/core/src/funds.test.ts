import { describe, expect, it } from "vitest";
import { formatAssetAmount, parseAssetAmount, publicFundsRecord, type FundsRecord } from "./funds";

describe("Funds public boundary", () => {
  it("parses 7-decimal USDC exactly and rejects rounding", () => {
    expect(parseAssetAmount("2.0000001")).toBe(20_000_001n);
    expect(formatAssetAmount(20_000_001n)).toBe("2.0000001");
    expect(() => parseAssetAmount("2.00000001")).toThrow("at most 7 decimals");
    expect(() => parseAssetAmount("0")).toThrow("positive");
  });
  it("never returns the SEP token or pre-authorized envelopes to the client", () => {
    const record = { id: "id", kind: "withdraw", stage: "awaiting_passkey", wallet: "wallet", anchorHomeDomain: "anchor", sepToken: "secret-token", sep6Id: "sep6", quoteId: "quote", plan: { publicKey: "landing", amountStroops: "20000000", forwardTxXdr: "secret-forward", cleanupTxXdr: "secret-cleanup" } } as FundsRecord;
    const response = publicFundsRecord(record);
    expect(response.amountUsdc).toBe("2.0000000");
    expect(JSON.stringify(response)).not.toMatch(/secret-token|secret-forward|secret-cleanup/);
  });
});
