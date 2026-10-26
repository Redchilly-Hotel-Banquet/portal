import { stringifyId } from "./objectId";

type Doc = Record<string, any>;

const ids = (values: unknown[]): string[] =>
  Array.from(new Set(values.map((value) => stringifyId(value)).filter((id): id is string => Boolean(id))));

/**
 * The rooms a booking actually holds.
 *
 * The check-in record is authoritative: when reception has saved assigned rooms, those are the rooms,
 * whatever else is lying around on the booking. Only bookings with no such record (older data, or rooms
 * set without a check-in) fall back to the loose `room_id` / `room_ids` / `rooms_allocated` fields.
 * Reading every field at once is what let a room that was un-ticked still count as assigned.
 */
export function assignedRoomIds(booking: Doc | null | undefined): string[] {
  const details = booking?.checkin_details;
  const fromCheckin = Array.isArray(details?.assigned_rooms)
    ? ids(details.assigned_rooms.map((entry: Doc) => entry?.id ?? entry?._id ?? entry?.room_id))
    : [];
  if (fromCheckin.length > 0) return fromCheckin;

  return ids([
    booking?.room_id,
    ...(Array.isArray(booking?.room_ids) ? booking!.room_ids : []),
    ...(Array.isArray(booking?.rooms_allocated)
      ? booking!.rooms_allocated.map((entry: Doc) => entry?.room_id ?? entry?._id)
      : []),
  ]);
}

export const holdsRoom = (booking: Doc | null | undefined, roomId: unknown): boolean => {
  const id = stringifyId(roomId);
  return Boolean(id) && assignedRoomIds(booking).includes(id!);
};

/**
 * Once a guest is checked in and a room is assigned, their check-in record belongs to the front desk.
 * Guests can no longer change it; only reception can.
 */
export const isCheckinLocked = (booking: Doc | null | undefined): boolean =>
  String(booking?.status ?? "").toUpperCase() === "CHECKED_IN" && assignedRoomIds(booking).length > 0;

/**
 * One room for a range of nights within a stay. A stay that was extended into another room, or at another
 * rate, is a list of these; a stay that never changed has none and is read from its booking dates.
 */
export type StaySegment = {
  room_id: string;
  code?: string;
  type?: string;
  /** First night (a calendar day, stored at 00:00 UTC). */
  from: Date | string;
  /** Day of departure from this room. */
  to: Date | string;
  nights: number;
  rate: number;
  amount: number;
  kind?: "STAY" | "EXTENSION";
};

export const staySegments = (booking: Doc | null | undefined): StaySegment[] =>
  Array.isArray(booking?.stay_segments) ? (booking!.stay_segments as StaySegment[]) : [];

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const time = (value: unknown) => new Date(value as string).getTime();

/** Today's calendar date in India as a 00:00 UTC instant, comparable with stored stay dates. */
export const todayInIndia = (now = new Date()): number => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
};

/**
 * Rooms the booking holds on the nights in [from, to). With stay segments, only rooms whose segment touches
 * those nights; otherwise every room, if the booking's own dates overlap. `inclusive` also counts a shared
 * boundary day, which is how the older availability checks treat same-day turnover.
 */
export function roomsHeldDuring(booking: Doc | null | undefined, from: Date, to: Date, inclusive = false): string[] {
  const segments = staySegments(booking);
  const overlaps = (start: number, end: number) =>
    inclusive ? start <= to.getTime() && end >= from.getTime() : start < to.getTime() && end > from.getTime();
  if (segments.length > 0) {
    return Array.from(new Set(segments.filter((segment) => overlaps(time(segment.from), time(segment.to))).map((segment) => segment.room_id)));
  }
  if (!booking?.check_in_date || !booking?.check_out_date) return assignedRoomIds(booking);
  return overlaps(time(booking.check_in_date), time(booking.check_out_date)) ? assignedRoomIds(booking) : [];
}

/**
 * The rooms a guest is in right now. For an extended stay that moves between rooms, that is the room for
 * today's night (and, on the day of the move, both the room being left and the one being entered).
 */
export function currentRoomIds(booking: Doc | null | undefined, now = new Date()): string[] {
  const segments = staySegments(booking);
  if (segments.length === 0) return assignedRoomIds(booking);
  const today = todayInIndia(now);
  const active = segments.filter((segment) => time(segment.from) <= today && today <= time(segment.to));
  // Before the first night or after the last (a late departure) the nearest segment still applies.
  const chosen = active.length > 0 ? active : [segments.reduce((best, segment) => (time(segment.to) > time(best.to) ? segment : best))];
  return Array.from(new Set(chosen.map((segment) => segment.room_id)));
}

/** The booking as it looks for a date window, for the availability code that reads `assignedRoomIds`. */
export function bookingViewForWindow<T extends Doc>(booking: T, from: Date, to: Date, inclusive = true): T {
  if (staySegments(booking).length === 0) return booking;
  const held = roomsHeldDuring(booking, from, to, inclusive);
  return {
    ...booking,
    room_id: held[0] ?? null,
    room_ids: held,
    rooms_allocated: [],
    checkin_details: { ...(booking.checkin_details ?? {}), assigned_rooms: held.map((id) => ({ id })) },
  };
}
