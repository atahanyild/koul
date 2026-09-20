export const KOUL = { oracle: process.env.NEXT_PUBLIC_KOUL_ORACLE ?? "CB6VNXADXR3XHCS4EKV5ZR5UJUZYQ5BZTPRHCNQE3XMKQMB4LJG6MKW2" };
export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const usdPerTryToTryPerUsd = (price: bigint): number => price === 0n ? 0 : 1e14 / Number(price);
export const tryPerUsdToUsdPerTry = (price: number): bigint => BigInt(Math.round(1e14 / price));
