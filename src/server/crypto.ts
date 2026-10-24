import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc1:";

/**
 * Key for sealing saved identity details. Set PROFILE_ENCRYPTION_KEY to keep it independent of
 * JWT_SECRET: rotating the JWT secret would otherwise make existing saved details unreadable.
 */
const key = () =>
  createHash("sha256")
    .update(process.env.PROFILE_ENCRYPTION_KEY || `rc-profile-details:${process.env.JWT_SECRET ?? ""}`)
    .digest();

/** AES-256-GCM. Output is self-describing so values can be recognised and rotated later. */
export const seal = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
};

/** Returns null for anything that is not a valid sealed value (tampered, wrong key, plain text). */
export const unseal = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
};
