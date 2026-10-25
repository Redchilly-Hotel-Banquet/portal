import { randomInt, timingSafeEqual } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { HttpError } from "../httpError";
import type { AuthenticatedUser } from "../session";
import { assignedRoomIds } from "./roomAssignments";
import { stringifyId } from "./objectId";

/**
 * The check-in ID is a 6-digit number on every booking. It is what proves a person is a guest of the
 * room, so ordering to a room needs it (or the signed-in account that owns the booking).
 */
export const generateCheckinId = () => String(randomInt(100_000, 1_000_000));

export const ensureUniqueCheckinId = async (bookings: Collection<any>): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateCheckinId();
    if (!(await bookings.findOne({ checkin_id: candidate }, { projection: { _id: 1 } }))) return candidate;
  }
  throw new HttpError(500, "Could not allocate a check-in ID. Please try again.");
};

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const ATTEMPTS = "checkin_attempts";

const sameId = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Checks a guest-supplied check-in ID. Failed guesses are counted per `scope` (a room or a booking), and
 * after five in 15 minutes that scope is locked until the window passes, so the 1-in-a-million code
 * cannot be brute-forced.
 */
export const assertCheckinId = async (
  db: Db,
  scope: string,
  booking: Record<string, any> | null,
  provided: unknown,
): Promise<void> => {
  const attempts = db.collection<{ _id: string; count: number; since: Date }>(ATTEMPTS);
  const now = Date.now();
  const record = await attempts.findOne({ _id: scope });
  const active = record && now - record.since.getTime() < WINDOW_MS ? record : null;
  if (active && active.count >= MAX_FAILURES) {
    throw new HttpError(429, "Too many wrong check-in IDs. Please wait a few minutes or ask the front desk.");
  }

  const given = typeof provided === "string" || typeof provided === "number" ? String(provided).trim() : "";
  const actual = typeof booking?.checkin_id === "string" ? booking.checkin_id : "";
  if (actual && /^\d{6}$/.test(given) && sameId(given, actual)) {
    if (active) await attempts.deleteOne({ _id: scope });
    return;
  }

  await attempts.updateOne(
    { _id: scope },
    active ? { $inc: { count: 1 } } : { $set: { count: 1, since: new Date(now) } },
    { upsert: true },
  );
  throw new HttpError(403, "That check-in ID is not correct for this room.");
};

/** The signed-in account that made, or is the verified email of, the booking. */
export const ownsBooking = (booking: Record<string, any> | null, user: AuthenticatedUser | null): boolean => {
  if (!booking || user?.src !== "user") return false;
  if (String(booking.user_id ?? "") === user.id) return true;
  const email = typeof booking.guest_email === "string" ? booking.guest_email.trim().toLowerCase() : "";
  return Boolean(email && user.email && email === user.email.toLowerCase());
};

/** The booking currently checked in to this room, or null. Only checked-in stays may order to a room. */
export const findCheckedInBookingForRoom = async (db: Db, roomId: string, outletKey?: string) => {
  const candidates = await db
    .collection("bookings")
    .find({
      status: "CHECKED_IN",
      ...(outletKey ? { outlet_id: outletKey } : {}),
      $or: [{ room_id: roomId }, { room_ids: roomId }, { "rooms_allocated.room_id": roomId }, { "checkin_details.assigned_rooms.id": roomId }],
    })
    .toArray();
  return candidates.find((booking) => assignedRoomIds(booking).includes(roomId)) ?? null;
};

export const bookingIdOf = (booking: Record<string, any>) => stringifyId(booking._id) ?? "";
