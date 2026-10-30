/** Check-in and check-out times of a branch, as 24-hour "HH:mm" in India time. */
export type StayTimes = { checkin_time: string; checkout_time: string };

export const DEFAULT_STAY_TIMES: StayTimes = { checkin_time: "14:00", checkout_time: "11:00" };

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isClock = (value: unknown): value is string => typeof value === "string" && CLOCK.test(value.trim());

export const normaliseClock = (value: unknown, fallback: string): string => (isClock(value) ? value.trim() : fallback);

/** "14:00" as "2:00 PM". */
export const formatClock = (value: string): string => {
  const [hours, minutes] = value.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
};

export const resolveStayTimes = (source?: Partial<Record<keyof StayTimes, unknown>> | null): StayTimes => ({
  checkin_time: normaliseClock(source?.checkin_time, DEFAULT_STAY_TIMES.checkin_time),
  checkout_time: normaliseClock(source?.checkout_time, DEFAULT_STAY_TIMES.checkout_time),
});

export type StayPhase = "upcoming" | "open" | "over";

/** The instant a stored stay date (a calendar day held as 00:00 UTC) reaches a clock time in India. */
const at = (day: Date, clock: string): number => {
  const [hours, minutes] = clock.split(":").map(Number);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes) - IST_OFFSET_MS;
};

/**
 * When a stay may be checked in (from the check-in day at the branch's check-in time) and when it ends (the
 * check-out day at the check-out time). A same-day stay opens at the start of that day. Null when the booking
 * has no usable dates.
 */
export function stayWindow(
  checkIn: string | number | Date | null | undefined,
  checkOut: string | number | Date | null | undefined,
  times?: Partial<Record<keyof StayTimes, unknown>> | null,
): { opensAt: number; endsAt: number } | null {
  if (!checkIn || !checkOut) return null;
  const from = new Date(checkIn);
  const to = new Date(checkOut);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const { checkin_time, checkout_time } = resolveStayTimes(times);
  const endsAt = at(to, checkout_time);
  let opensAt = at(from, checkin_time);
  if (opensAt >= endsAt) opensAt = at(from, "00:00");
  return { opensAt, endsAt };
}

export function stayPhase(
  checkIn: string | number | Date | null | undefined,
  checkOut: string | number | Date | null | undefined,
  times?: Partial<Record<keyof StayTimes, unknown>> | null,
  now = Date.now(),
): StayPhase | null {
  const window = stayWindow(checkIn, checkOut, times);
  if (!window) return null;
  if (now < window.opensAt) return "upcoming";
  return now >= window.endsAt ? "over" : "open";
}
