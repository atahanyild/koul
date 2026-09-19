/**
 * Defense in depth against a Stellar secret seed leaking into logs, stored
 * records or counter events. Scans any value's JSON form for S… strkeys.
 */
import { StrKey } from "@stellar/stellar-sdk";

const SECRET_PATTERN = /S[A-Z2-7]{55}/g;

export function findSecrets(value: unknown): string[] {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  } catch {
    text = String(value);
  }
  const found = new Set<string>();
  for (const match of text.match(SECRET_PATTERN) ?? []) {
    if (StrKey.isValidEd25519SecretSeed(match)) found.add(match);
  }
  return [...found];
}

export function containsSecret(value: unknown): boolean {
  return findSecrets(value).length > 0;
}

/** Throw if `value` carries a secret seed anywhere in its JSON form. */
export function assertNoSecret(value: unknown, label = "value"): void {
  if (containsSecret(value)) {
    throw new Error(`${label} contains a Stellar secret seed; refusing to continue`);
  }
}
