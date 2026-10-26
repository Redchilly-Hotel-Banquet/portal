import { scryptSync, timingSafeEqual } from "node:crypto";
import { seal, unseal } from "../crypto";

/**
 * Staff passwords are kept encrypted (AES-GCM), not as one-way hashes, because an administrator can ask to see
 * them. They are never stored as plain text and never sent anywhere except to an administrator who asks.
 * Older accounts may hold plain text; those are encrypted at their next login. A few may hold a scrypt hash from
 * an earlier version; those still sign in but cannot be shown until a new password is set.
 */
const HASH_PREFIX = "scrypt$";
const SEALED_PREFIX = "enc1:";

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export const storePassword = (plain: string): string => seal(plain);

export const isSealed = (stored: unknown): boolean => typeof stored === "string" && stored.startsWith(SEALED_PREFIX);
export const isHashed = (stored: unknown): boolean => typeof stored === "string" && stored.startsWith(HASH_PREFIX);
export const isPlain = (stored: unknown): boolean => typeof stored === "string" && stored.length > 0 && !isSealed(stored) && !isHashed(stored);

export const verifyPassword = (plain: string, stored: unknown): boolean => {
  if (typeof stored !== "string" || !stored) return false;
  if (isSealed(stored)) {
    const actual = unseal(stored);
    return actual !== null && safeEqual(Buffer.from(plain), Buffer.from(actual));
  }
  if (isHashed(stored)) {
    const [, saltHex, hashHex] = stored.split("$");
    if (!saltHex || !hashHex) return false;
    return safeEqual(scryptSync(plain, Buffer.from(saltHex, "hex"), 64), Buffer.from(hashHex, "hex"));
  }
  return safeEqual(Buffer.from(plain), Buffer.from(stored));
};

/** The password as typed, or null when it cannot be recovered (a one-way hash, or a value that no longer decrypts). */
export const revealPassword = (stored: unknown): string | null => {
  if (isSealed(stored)) return unseal(stored);
  if (isPlain(stored)) return stored as string;
  return null;
};
