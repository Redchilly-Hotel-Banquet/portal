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
