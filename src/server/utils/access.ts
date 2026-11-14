import { HttpError } from "../httpError";
import type { AuthenticatedUser } from "../session";
import { outletDirectory } from "./outlets";

const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

/**
 * The branches a staff account may work in, as the branch keys the screens and sessions use. An account's list holds
 * branch ids (older ones, names, matched ignoring case and spaces); entries that match no branch are dropped.
 * ["all"] means every branch; an empty list means none.
 */
export const resolveOutlets = async (assigned: unknown[]): Promise<string[]> => {
  const list = Array.isArray(assigned) ? assigned : [];
  if (list.some((entry) => norm(entry) === "all")) return ["all"];
  if (list.length === 0) return [];
  await outletDirectory.load();
  const keys = list.map((entry) => outletDirectory.keyOf(outletDirectory.idOf(entry)));
  return Array.from(new Set(keys.filter((key): key is string => Boolean(key))));
};

export const isAdmin = (user: AuthenticatedUser) => user.roles.includes("admin");

/** `outletId` is a stored branch reference (an _id) or a branch key. */
export const canAccessOutlet = (user: AuthenticatedUser, outletId: unknown) =>
  user.outlets.includes("all") || user.outlets.includes(outletDirectory.keyOf(outletDirectory.idOf(outletId)) ?? "");

export const assertOutlet = (user: AuthenticatedUser, outletId: unknown) => {
  if (!canAccessOutlet(user, outletId)) throw new HttpError(403, "You do not have access to this branch.");
};

export const assertAdmin = (user: AuthenticatedUser, what = "change this") => {
  if (!isAdmin(user)) throw new HttpError(403, `Only an administrator can ${what}.`);
};

/** Mongo filter limiting a collection to the user's branches. */
export const outletFilter = (user: AuthenticatedUser): Record<string, unknown> =>
  user.outlets.includes("all") ? {} : { outlet_id: { $in: outletDirectory.idsOf(user.outlets) } };
