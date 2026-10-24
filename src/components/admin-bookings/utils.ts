import type { AllocatedRoom, AvailableRoom, Booking, CheckinContext } from "./types";

const DAY_MS = 86_400_000;

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const toDateInput = (value?: string | Date | null): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
};

export const stayNights = (booking: Pick<Booking, "check_in_date" | "check_out_date" | "nights">): number => {
  const start = booking.check_in_date ? new Date(booking.check_in_date).getTime() : NaN;
  const end = booking.check_out_date ? new Date(booking.check_out_date).getTime() : NaN;
  if (Number.isNaN(start) || Number.isNaN(end)) return booking.nights ?? 1;
  return Math.max(Math.ceil((end - start) / DAY_MS), 1);
};

export const roomLabel = (room: AllocatedRoom, index: number): string =>
  room.code ?? room.room_type ?? room.type ?? `Room ${index + 1}`;

export const roomNightlyRate = (room: AllocatedRoom): number =>
  Number(room.effective_rate_per_night ?? room.effective_rate ?? room.base_rate ?? 0);

export const bookingTotal = (booking: Booking): number => Number(booking.total_amount ?? booking.room_total ?? 0);

export const bookingRoomCount = (booking: Booking): number =>
  booking.rooms_requested ?? (booking.room_ids?.length || 1);

export const outletLabel = (booking: Booking): string =>
  booking.outlets?.name ?? booking.outlets?.location_key ?? booking.outlet_id ?? "-";

export const searchHaystack = (booking: Booking): string =>
  [
    booking.guest_name,
    booking.guest_email,
    booking.guest_phone,
    booking.booking_code,
    booking.status,
    ...(booking.rooms_allocated ?? []).flatMap((room) => [room.code, room.room_type, room.type]),
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ")
    .toLowerCase();

/** Booking overlaps the inclusive [from, to] date range (yyyy-mm-dd strings). */
export const overlapsRange = (booking: Booking, from: string, to: string): boolean => {
  if (!from && !to) return true;
  const start = booking.check_in_date ? toDateInput(booking.check_in_date) : "";
  const end = booking.check_out_date ? toDateInput(booking.check_out_date) : "";
  if (!start || !end) return false;
  if (from && end < from) return false;
  if (to && start > to) return false;
  return true;
};

export const filterAvailableRooms = (rooms: AvailableRoom[], term: string): AvailableRoom[] => {
  const q = term.trim().toLowerCase();
  if (!q) return rooms;
  const numeric = /^\d+$/.test(q);
  return rooms.filter((room) => {
    const code = (room.code ?? "").toString();
    if (code.toLowerCase().includes(q)) return true;
    if (numeric && code.replace(/\D+/g, "").includes(q)) return true;
    return (
      (room.id ?? "").toLowerCase().includes(q) ||
      (room.level ?? "").toLowerCase().includes(q) ||
      (room.room_type ?? room.type ?? "").toLowerCase().includes(q)
    );
  });
};

export const assignedRoomIds = (context: CheckinContext): string[] => {
  const details = context.checkinDetails;
  if (Array.isArray(details?.assigned_rooms)) {
    return details.assigned_rooms.map((room) => room?.id).filter((id): id is string => Boolean(id));
  }
  if (details?.assigned_room?.id) return [details.assigned_room.id];
  if (Array.isArray(context.booking?.room_ids)) {
    return context.booking.room_ids
      .map((value) => (typeof value === "string" ? value : String(value ?? "")))
      .filter(Boolean);
  }
  return [];
};

export const isCheckinComplete = (context: CheckinContext, fallbackStatus?: string): boolean =>
  (context.booking?.status ?? fallbackStatus) === "CHECKED_IN" || context.checkinDetails?.status === "COMPLETED";
