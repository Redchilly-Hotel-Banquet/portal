import { ObjectId } from "mongodb";

export const toObjectId = (value: unknown): ObjectId | null => {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && value.length === 24) {
    try {
      return new ObjectId(value);
    } catch {
      return null;
    }
  }
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
};

export const stringifyId = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (value instanceof ObjectId) {
    return value.toHexString();
  }
  if (typeof value === "object" && value && "$oid" in (value as Record<string, unknown>)) {
    const oid = (value as { $oid?: string }).$oid;
    return oid ? oid : null;
  }
  try {
    const str = (value as { toString?: () => string })?.toString?.();
    return str && str !== "[object Object]" ? str : null;
  } catch {
    return null;
  }
};
