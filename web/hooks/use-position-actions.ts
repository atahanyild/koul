"use client";

/**
 * Supply USDC to a pool or withdraw it back to the wallet, signed with the passkey. A wallet that has never supplied
 * has no XOXNO account yet: it passes account id 0, XOXNO mints the position, and the id comes back through the
 * position NFT on the next portfolio read.
 */
import { useCallback } from "react";
import { KoulWriter } from "@koul/core";
import { WRITE_CONFIG } from "@/lib/koul";
import { POOLS, type PoolId } from "@/lib/model/autopilot";
import { fmtUsdc } from "@/lib/format";
import { usePasskeyAction } from "./use-passkey-action";
import { usePortfolio } from "./use-portfolio";
import { useWallet } from "./use-wallet";

const writer = new KoulWriter(WRITE_CONFIG);
const INVALIDATE_PREFIXES = ["portfolio:", "pools"];

/** USDC has 7 decimals on Stellar. */
const USDC_UNIT = 1e7;
/** Withdrawals are snapped down to 0.01 USDC (100000 units). */
const WITHDRAW_STEP_UNITS = 100_000n;

export const toUsdcUnits = (usdc: number): bigint => BigInt(Math.round(usdc * USDC_UNIT));
export const fromUsdcUnits = (units: bigint): number => Number(units) / USDC_UNIT;

/**
 * XOXNO positions accrue interest every ledger, so an amount typed to the full 7 decimals can be a hair more than the
 * position holds by the time the transaction executes. Snapping down to a cent keeps the signed amount valid.
 */
export const snapWithdrawUnits = (units: bigint): bigint => units - (units % WITHDRAW_STEP_UNITS);

export function usePositionActions() {
  const { address } = useWallet();
  const { accountId } = usePortfolio();
  const action = usePasskeyAction();

  const supply = useCallback(async (poolId: PoolId, amountUsdc: number) => {
    if (!address) return null;
    const pool = POOLS[poolId];
    const units = toUsdcUnits(amountUsdc);
    return action.run(() => writer.buildSupply(address, accountId ?? 0n, pool.hub, units), {
      title: `Supplied ${fmtUsdc(fromUsdcUnits(units))} USDC to ${pool.name}`,
      invalidatePrefixes: INVALIDATE_PREFIXES,
    });
  }, [address, accountId, action]);

  const withdraw = useCallback(async (poolId: PoolId, amountUsdc: number) => {
    if (!address || accountId === null) return null;
    const pool = POOLS[poolId];
    const units = snapWithdrawUnits(toUsdcUnits(amountUsdc));
    return action.run(() => writer.buildWithdraw(address, accountId, pool.hub, units), {
      title: `Withdrew ${fmtUsdc(fromUsdcUnits(units))} USDC from ${pool.name}`,
      invalidatePrefixes: INVALIDATE_PREFIXES,
    });
  }, [address, accountId, action]);

  return { supply, withdraw, action, ready: !!address };
}
