import { HttpError } from "../httpError";
import { mongoConnection } from "../mongo";
import type { AuthenticatedUser } from "../session";

const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

let cache: { keys: string[]; at: number } | null = null;
const TTL_MS = 60_000;

const branchKeys = async (): Promise<string[]> => {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.keys;
  const docs = await mongoConnection.getDb().collection("outlets").find({}, { projection: { location_key: 1 } }).toArray();
  const keys = docs.map((doc) => String(doc.location_key ?? "")).filter(Boolean);
  cache = { keys, at: Date.now() };
  return keys;
};

/**
 * The branches a staff account may work in, as the real branch keys used on rooms, menus, bookings and orders.
 * An account's list is matched ignoring case and spaces ("redchilly3.0" reaches "Red Chilly 3.0"), and entries
 * that match no branch are dropped. ["all"] means every branch; an empty list means none.
 */
export const resolveOutlets = async (assigned: string[]): Promise<string[]> => {
  const wanted = (Array.isArray(assigned) ? assigned : []).map(norm).filter(Boolean);
  if (wanted.includes("all")) return ["all"];
  if (wanted.length === 0) return [];
  const keys = await branchKeys();
  return keys.filter((key) => wanted.includes(norm(key)));
};

export const isAdmin = (user: AuthenticatedUser) => user.roles.includes("admin");

export const canAccessOutlet = (user: AuthenticatedUser, outletId: unknown) =>
  user.outlets.includes("all") || user.outlets.includes(String(outletId ?? ""));

export const assertOutlet = (user: AuthenticatedUser, outletId: unknown) => {
  if (!canAccessOutlet(user, outletId)) throw new HttpError(403, "You do not have access to this branch.");
};

export const assertAdmin = (user: AuthenticatedUser, what = "change this") => {
  if (!isAdmin(user)) throw new HttpError(403, `Only an administrator can ${what}.`);
};

/** Mongo filter limiting a collection to the user's branches. */
export const outletFilter = (user: AuthenticatedUser): Record<string, unknown> =>
  user.outlets.includes("all") ? {} : { outlet_id: { $in: user.outlets } };
