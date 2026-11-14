import { ObjectId } from "mongodb";
import { mongoConnection } from "../mongo";
import { stringifyId, toObjectId } from "./objectId";

/**
 * Branches are stored everywhere by the branch's _id. The branch's `location_key` is its public name: it is what
 * URLs, QR codes, signed-in sessions and the screens use, so it is translated at the edge of the server and never
 * stored on bookings, rooms, menus or orders.
 */
const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

type Directory = { byKey: Map<string, ObjectId>; byId: Map<string, string>; at: number };
let directory: Directory | null = null;
const TTL_MS = 60_000;

const read = async (): Promise<Directory> => {
  const docs = await mongoConnection.getDb().collection("outlets").find({}, { projection: { location_key: 1 } }).toArray();
  const byKey = new Map<string, ObjectId>();
  const byId = new Map<string, string>();
  for (const doc of docs) {
    const key = String(doc.location_key ?? "");
    if (!key) continue;
    byKey.set(norm(key), doc._id as ObjectId);
    byId.set(String(doc._id), key);
  }
  return { byKey, byId, at: Date.now() };
};

export const outletDirectory = {
  /** Loads the branch list (kept for a minute). Call once per request before the helpers below. */
  async load(): Promise<void> {
    if (!directory || Date.now() - directory.at > TTL_MS) directory = await read();
  },
  /** Call after a branch is created, renamed or deleted. */
  invalidate() {
    directory = null;
  },
  /** The branch's _id for a location key (case and spaces ignored), a hex id, or an ObjectId. Null when unknown. */
  idOf(value: unknown): ObjectId | null {
    if (value instanceof ObjectId) return directory?.byId.has(String(value)) ? value : null;
    const text = String(value ?? "").trim();
    const byKey = directory?.byKey.get(norm(text));
    if (byKey) return byKey;
    const asId = /^[0-9a-f]{24}$/i.test(text) ? toObjectId(text) : null;
    return asId && directory?.byId.has(String(asId)) ? asId : null;
  },
  /** The location key for a branch _id (hex or ObjectId). A value that is already a key is returned as it is. */
  keyOf(value: unknown): string | null {
    const id = stringifyId(value);
    if (!id) return null;
    return directory?.byId.get(id) ?? (directory?.byKey.has(norm(id)) ? id : null);
  },
  /** _ids for a list of keys / ids; unknown entries are left out. */
  idsOf(values: unknown[]): ObjectId[] {
    return values.map((v) => this.idOf(v)).filter((v): v is ObjectId => v !== null);
  },
  allKeys(): string[] {
    return directory ? [...directory.byId.values()] : [];
  },
};

/** A branch given as key or id, as the _id to store. Throws nothing; null when it matches no branch. */
export const outletIdOf = (value: unknown) => outletDirectory.idOf(value);
/** A stored branch reference as the key the screens use (falls back to the raw text if the branch is gone). */
export const outletKeyOf = (value: unknown) => outletDirectory.keyOf(value) ?? stringifyId(value);
