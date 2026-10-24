import { stringifyId } from "./objectId";

export const normalizeDocument = <T extends Record<string, unknown>>(doc: T | null | undefined) => {
  if (!doc) return null;
  const clone: Record<string, unknown> = { ...doc };
  const resolvedId = stringifyId(clone._id) ?? stringifyId(clone.id);
  if (resolvedId) {
    clone.id = resolvedId;
  }
  delete clone._id;
  return clone as T & { id: string };
};

export const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value as T];
};
