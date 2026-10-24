import type { AllocatedRoom, AssignedRoom, Booking, CheckinGuest } from "./types";

export type InvoiceRoom = { key: string; code: string; type: string; mismatch: boolean };

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const roomType = (room: AllocatedRoom | AssignedRoom): string => (room.type ?? room.room_type ?? "").trim();

/** Requested room types with counts, from preferred_categories, else preferred_room_type. */
export function requestedRoomTypes(booking: Booking): Array<{ type: string; count: number }> {
  const categories = Object.entries(booking.preferred_categories ?? {})
    .map(([type, count]) => ({ type: type.trim(), count: Number(count) || 0 }))
    .filter((entry) => entry.type && entry.count > 0);
  if (categories.length > 0) return categories;
  const single = booking.preferred_room_type?.trim();
  if (!single) return [];
  return [{ type: single, count: Math.max(booking.rooms_requested ?? 1, 1) }];
}

export function requestedRoomLabel(booking: Booking): string {
  return requestedRoomTypes(booking)
    .map(({ type, count }) => (count > 1 || booking.preferred_categories ? `${type} x ${count}` : type))
    .join(", ");
}

/** Assigned rooms (check-in record first, else folio rooms) with a mismatch flag against the requested type counts. */
export function assignedRooms(booking: Booking): InvoiceRoom[] {
  const fromCheckin = booking.checkin_details?.assigned_rooms ?? [];
  const source: Array<AllocatedRoom | AssignedRoom> =
    fromCheckin.length > 0 ? fromCheckin : (booking.rooms_allocated ?? []);
  const remaining = new Map<string, number>();
  for (const { type, count } of requestedRoomTypes(booking)) remaining.set(norm(type), (remaining.get(norm(type)) ?? 0) + count);
  const hasRequest = remaining.size > 0;

  return source.map((room, index) => {
    const type = roomType(room);
    const key = norm(type);
    const left = remaining.get(key) ?? 0;
    const matches = left > 0;
    if (matches) remaining.set(key, left - 1);
    const id = "room_id" in room ? (room.room_id ?? room.id) : room.id;
    return {
      key: id ?? `${room.code ?? "room"}-${index}`,
      code: room.code?.trim() || `Room ${index + 1}`,
      type: type || "Type not recorded",
      mismatch: hasRequest && Boolean(type) && !matches,
    };
  });
}

export type RoomRow = {
  /** 1-based line number. */
  line: number;
  /** Type asked for at booking time, or null when the booking recorded no preference. */
  requested: string | null;
  /** Room number as printed on the door/key, with its real type. Null while still unassigned. */
  room: { number: string; type: string } | null;
  status: "as-requested" | "different" | "not-assigned" | "additional" | "assigned";
};

export const ROOM_STATUS_LABEL: Record<RoomRow["status"], string> = {
  "as-requested": "As requested",
  different: "Different from request",
  "not-assigned": "Not assigned yet",
  additional: "Additional room",
  assigned: "Assigned",
};

/**
 * Pairs what was requested with what was assigned, one row per room. A room of the requested type
 * takes its slot; a room of another type takes over a slot that nobody matched; extra rooms are
 * "additional" and requested slots with no room yet are "not assigned".
 */
export function pairRooms(booking: Booking): RoomRow[] {
  const assigned = assignedRooms(booking);
  const slots: string[] = [];
  for (const { type, count } of requestedRoomTypes(booking)) for (let i = 0; i < count; i += 1) slots.push(type);
  const hasRequest = slots.length > 0;

  const rows: Array<Omit<RoomRow, "line">> = [];
  const open = [...slots];
  const unmatched: InvoiceRoom[] = [];

  // First pass: rooms whose type was requested claim their slot.
  const matched = new Map<InvoiceRoom, string>();
  for (const room of assigned) {
    const at = open.findIndex((type) => norm(type) === norm(room.type));
    if (at >= 0) matched.set(room, open.splice(at, 1)[0]);
    else unmatched.push(room);
  }
  // Second pass: everything else takes over a slot nobody matched, or is an extra room.
  for (const room of assigned) {
    const number = room.code;
    if (matched.has(room)) {
      rows.push({ requested: matched.get(room)!, room: { number, type: room.type }, status: "as-requested" });
    } else if (open.length > 0) {
      rows.push({ requested: open.shift()!, room: { number, type: room.type }, status: "different" });
    } else {
      rows.push({ requested: null, room: { number, type: room.type }, status: hasRequest ? "additional" : "assigned" });
    }
  }
  for (const type of open) rows.push({ requested: type, room: null, status: "not-assigned" });

  return rows.map((row, index) => ({ ...row, line: index + 1 }));
}

export function roomMismatchNote(booking: Booking, rooms: InvoiceRoom[]): string | null {
  if (!rooms.some((room) => room.mismatch)) return null;
  const assigned = rooms.map((room) => room.type).join(", ");
  return `Room type differs from the request: requested ${requestedRoomLabel(booking)}; assigned ${assigned}`;
}

export function guestCountLabel(booking: Booking): string {
  const staying = booking.checkin_details?.guests?.length ?? 0;
  const booked = booking.number_of_guests;
  if (staying > 0 && booked != null && staying !== booked) return `${staying} staying (${booked} booked)`;
  if (staying > 0) return String(staying);
  return booked != null ? String(booked) : "Not provided";
}

/** Aadhaar numbers are masked to the last four digits; other documents print in full. */
export function formatDocumentNumber(type: string | null | undefined, number: string | null | undefined): string {
  const value = (number ?? "").trim();
  if (!value) return "Not provided";
  if (/aadh?aa?r/i.test(type ?? "")) {
    const digits = value.replace(/\D/g, "");
    if (digits.length >= 4) return `XXXX XXXX ${digits.slice(-4)}`;
  }
  return value;
}

export function guestHeading(guest: CheckinGuest, index: number, booked: number | undefined): string {
  const name = guest.full_name?.trim() || `Guest ${index + 1}`;
  return booked != null && index >= booked ? `${name} (Additional guest)` : name;
}
