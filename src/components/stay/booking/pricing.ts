import type { AvailabilityResponse, AvailableRoom, CategoryEntry, Selections } from "./types";

export type PricedRoom = AvailableRoom & { category: string };

export const rateOf = (room: AvailableRoom) => Number(room.effective_rate_per_night ?? room.price_per_night ?? 0);

export const roomTotal = (room: AvailableRoom, nights: number) =>
  Number(room.effective_total ?? Number(room.price_per_night ?? 0) * (nights || 1));

const categoryOf = (room: AvailableRoom) => {
  const raw = room.room_type ? String(room.room_type).trim() : "";
  if (raw) return raw;
  return room.type === "ROOM" || !room.type ? "Standard Room" : room.type;
};

export interface Pricing {
  categories: CategoryEntry[];
  /** Rooms picked per category, cheapest first, in the same way the booking will be allocated. */
  chosen: PricedRoom[];
  /** Category whose requested count exceeds the rooms returned, if any. */
  shortCategory: string | null;
  nightlyTotal: number;
  estimatedTotal: number;
  capacity: number;
  roomCount: number;
}

export function derivePricing(
  availability: AvailabilityResponse | undefined,
  selections: Selections,
  nights: number,
): Pricing {
  const rooms: PricedRoom[] = (availability?.rooms ?? [])
    .map((room) => ({ ...room, category: categoryOf(room) }))
    .sort((a, b) => rateOf(a) - rateOf(b));

  const buckets = new Map<string, PricedRoom[]>();
  rooms.forEach((room) => {
    const list = buckets.get(room.category) ?? [];
    list.push(room);
    buckets.set(room.category, list);
  });

  const categories: CategoryEntry[] =
    availability?.categories && availability.categories.length > 0
      ? availability.categories.map((entry) => ({ ...entry, amenities: entry.amenities ?? [] }))
      : Array.from(buckets.entries())
          .map(([category, list]) => {
            const rates = list.map(rateOf);
            return {
              category,
              available_count: list.length,
              min_rate: Math.min(...rates),
              max_rate: Math.max(...rates),
              max_occupancy: Math.max(...list.map((r) => Number(r.occupancy ?? 2))),
              amenities: Array.from(new Set(list.flatMap((r) => r.amenities ?? []).map(String))),
            };
          })
          .sort((a, b) => a.min_rate - b.min_rate);

  const chosen: PricedRoom[] = [];
  let shortCategory: string | null = null;
  for (const [category, count] of Object.entries(selections)) {
    if (count <= 0) continue;
    const bucket = buckets.get(category) ?? [];
    if (count > bucket.length && !shortCategory) shortCategory = category;
    chosen.push(...bucket.slice(0, count));
  }

  return {
    categories,
    chosen,
    shortCategory,
    nightlyTotal: chosen.reduce((sum, room) => sum + rateOf(room), 0),
    estimatedTotal: chosen.reduce((sum, room) => sum + roomTotal(room, nights), 0),
    capacity: chosen.reduce((sum, room) => sum + Number(room.occupancy ?? 2), 0),
    roomCount: Object.values(selections).reduce((sum, n) => sum + n, 0),
  };
}
