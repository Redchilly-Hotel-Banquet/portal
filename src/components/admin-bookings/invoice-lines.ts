import { formatDate } from "@/components/admin/format";
import { assignedRooms } from "./invoice-details";
import type { Booking, GstLine } from "./types";
import { roomNightlyRate } from "./utils";

export type RoomChargeLine = { key: string; label: string; nights: number; rate: number; amount: number; /** Dates this room was occupied, when the stay moved or was extended. */ period?: string };

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * One line per room: nights x rate = amount, adding up exactly to the room total on the bill. Priced rooms
 * keep their own rates (scaled if the room total was negotiated); otherwise the total is shared equally.
 */
export function roomChargeLines(booking: Booking, roomTotal: number, nights: number): RoomChargeLine[] {
  // A stay with room lines is billed exactly as recorded: each room, its nights and its own rate.
  if ((booking.stay_segments?.length ?? 0) > 0) {
    return booking.stay_segments!.map((segment, index) => ({
      key: `${segment.room_id}-${index}`,
      label: `Room ${segment.code || segment.room_id}${segment.type ? ` (${segment.type})` : ""}`,
      nights: segment.nights,
      rate: segment.rate,
      amount: segment.amount,
      period: `${formatDate(segment.from)} to ${formatDate(segment.to)}`,
    }));
  }

  const stayNights = Math.max(nights, 1);
  const rooms = assignedRooms(booking);
  const priced = booking.rooms_allocated ?? [];
  const count = Math.max(rooms.length, priced.length, booking.rooms_requested ?? 0, 1);

  const weights = Array.from({ length: count }, (_, index) => {
    const line = priced[index];
    return line ? Math.max(Number(line.total) || roomNightlyRate(line) * stayNights, 0) : 0;
  });
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weightSum > 0 ? weights.map((weight) => (weight / weightSum) * roomTotal) : weights.map(() => roomTotal / count);

  let allocated = 0;
  return shares.map((share, index) => {
    // The last line takes the rounding difference so the lines always add up to the room total.
    const amount = index === count - 1 ? money(roomTotal - allocated) : money(share);
    allocated += amount;
    const room = rooms[index];
    const type = room?.type && room.type !== "Type not recorded" ? room.type : (priced[index]?.type ?? priced[index]?.room_type ?? "");
    return {
      key: room?.key ?? `room-${index}`,
      label: room ? `Room ${room.code}${type ? ` (${type})` : ""}` : `Room ${index + 1}${type ? ` (${type})` : ""}, not yet assigned`,
      nights: stayNights,
      rate: money(amount / stayNights),
      amount,
    };
  });
}

/** Plain-words reason for a GST rate, so the bill can be checked by hand. */
export function gstBasis(line: GstLine, formatINR: (value: number) => string): string {
  if (line.kind === "ROOM") {
    const tariff = formatINR(line.tariff ?? 0);
    return line.rate === 18
      ? `Tariff ${tariff} per room per night is above ${formatINR(7500)}`
      : `Tariff ${tariff} per room per night is ${formatINR(7500)} or less`;
  }
  return line.rate === 18
    ? `Room tariff above ${formatINR(7500)} per night, so dining is taxed at 18%`
    : "Standard restaurant dining";
}
