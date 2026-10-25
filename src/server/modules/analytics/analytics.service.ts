import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { AuthenticatedUser } from "../../session";

type AnalyticsBucket = {
  outlet_id: string;
  outlet_name: string;
  total_orders: number;
  total_revenue: number;
  today_orders: number;
  total_bookings: number;
  active_bookings: number;
  total_rooms: number;
  total_tables: number;
  food_revenue: number;
  /** Amount received per payment source, from bookings checked out with payments recorded. */
  payments_by_mode: Record<string, number>;
  payment_counts: Record<string, number>;
  /** GST collected on checked-out stays. */
  gst_collected: number;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
};

const resolveOutletId = (outlet: any) =>
  outlet?.location_key ?? outlet?.outlet_id ?? outlet?._id?.toString?.() ?? String(outlet?._id ?? "UNKNOWN");

export const MAX_RANGE_MONTHS = 6;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** A calendar day (YYYY-MM-DD) as the start or end instant of that day in India, where the properties are. */
const istBoundary = (value: unknown, end: boolean): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  if (new Date(utc).getUTCDate() !== day) return null;
  return new Date(utc - IST_OFFSET_MS + (end ? 24 * 60 * 60 * 1000 - 1 : 0));
};

/** Same calendar day `months` later; the last day of a shorter month is used where needed. */
const addMonths = (date: Date, months: number): Date => {
  const copy = new Date(date.getTime());
  const day = copy.getUTCDate();
  copy.setUTCDate(1);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(copy.getUTCFullYear(), copy.getUTCMonth() + 1, 0)).getUTCDate();
  copy.setUTCDate(Math.min(day, lastDay));
  return copy;
};

export type AnalyticsRequest = { from?: string; to?: string };

export class AnalyticsService {
  /**
   * With no range, figures cover everything (the dashboard's totals). With a range, orders and bookings
   * are those created in it and payments are those received in it; a range may span at most six months.
   */
  async getOutletAnalytics(user: AuthenticatedUser, request: AnalyticsRequest = {}) {
    if (!user.roles.includes("admin")) {
      throw new HttpError(403, "Insufficient permissions to view analytics");
    }

    let range: { from: Date; to: Date } | null = null;
    if (request.from || request.to) {
      const from = istBoundary(request.from, false);
      const to = istBoundary(request.to, true);
      if (!from || !to) throw new HttpError(400, "Choose a valid start and end date.");
      if (to < from) throw new HttpError(400, "The end date must be on or after the start date.");
      // from's day is its first day; the window may run up to, but not past, the same day six months on.
      if (to.getTime() >= addMonths(from, MAX_RANGE_MONTHS).getTime()) {
        throw new HttpError(400, `Choose a period of at most ${MAX_RANGE_MONTHS} months.`);
      }
      range = { from, to };
    }
    const inRange = (field: string) => (range ? { [field]: { $gte: range.from, $lte: range.to } } : {});

    const db = mongoConnection.getDb();
    const outletsCollection = db.collection("outlets");
    const ordersCollection = db.collection("orders");
    const bookingsCollection = db.collection("bookings");
    const roomsCollection = db.collection("rooms_tables");

    const outlets = await outletsCollection.find({}).toArray();
    const buckets = new Map<string, AnalyticsBucket>();

    const initialiseBucket = (outlet: any) => {
      const outletId = resolveOutletId(outlet);
      if (!outletId) return;
      if (!buckets.has(outletId)) {
        buckets.set(outletId, {
          outlet_id: outletId,
          outlet_name: outlet?.name ?? outlet?.location_key ?? outletId,
          total_orders: 0,
          total_revenue: 0,
          today_orders: 0,
          total_bookings: 0,
          active_bookings: 0,
          total_rooms: 0,
          total_tables: 0,
          food_revenue: 0,
          payments_by_mode: {},
          payment_counts: {},
          gst_collected: 0,
        });
      }
    };

    outlets.forEach(initialiseBucket);

    const midnight = (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();

    const outletFilter = !user.outlets.includes("all") ? { outlet_id: { $in: user.outlets } } : {};

    const orders = await ordersCollection.find({ ...outletFilter, ...inRange("created_at") }).toArray();
    orders.forEach((order: any) => {
      const outletId = order.outlet_id ?? "UNKNOWN";
      if (!buckets.has(outletId)) {
        buckets.set(outletId, {
          outlet_id: outletId,
          outlet_name: outletId,
          total_orders: 0,
          total_revenue: 0,
          today_orders: 0,
          total_bookings: 0,
          active_bookings: 0,
          total_rooms: 0,
          total_tables: 0,
          food_revenue: 0,
          payments_by_mode: {},
          payment_counts: {},
          gst_collected: 0,
        });
      }
      const bucket = buckets.get(outletId)!;
      bucket.total_orders += 1;
      const orderTotal = toNumber(order.total, toNumber(order.subtotal));
      bucket.total_revenue += orderTotal;
      bucket.food_revenue += orderTotal;

      const createdAt = order.created_at ? new Date(order.created_at) : null;
      if (createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= midnight) {
        bucket.today_orders += 1;
      }
    });

    const bookingsFilter = !user.outlets.includes("all") ? { outlet_id: { $in: user.outlets } } : {};
    const bookings = await bookingsCollection.find({ ...bookingsFilter, ...inRange("created_at") }).toArray();
    bookings.forEach((booking: any) => {
      const outletId = booking.outlet_id ?? "UNKNOWN";
      if (!buckets.has(outletId)) {
        buckets.set(outletId, {
          outlet_id: outletId,
          outlet_name: outletId,
          total_orders: 0,
          total_revenue: 0,
          today_orders: 0,
          total_bookings: 0,
          active_bookings: 0,
          total_rooms: 0,
          total_tables: 0,
          food_revenue: 0,
          payments_by_mode: {},
          payment_counts: {},
          gst_collected: 0,
        });
      }
      const bucket = buckets.get(outletId)!;
      bucket.total_bookings += 1;
      bucket.total_revenue += toNumber(booking.total_amount);
    });

    const bucketFor = (outletId: string) => {
      if (!buckets.has(outletId)) {
        buckets.set(outletId, {
          outlet_id: outletId,
          outlet_name: outletId,
          total_orders: 0,
          total_revenue: 0,
          today_orders: 0,
          total_bookings: 0,
          active_bookings: 0,
          total_rooms: 0,
          total_tables: 0,
          food_revenue: 0,
          payments_by_mode: {},
          payment_counts: {},
          gst_collected: 0,
        });
      }
      return buckets.get(outletId)!;
    };

    // "Active" is how many stays are open right now, whatever period is chosen.
    const active = await bookingsCollection
      .find({ ...bookingsFilter, status: { $in: ["CONFIRMED", "CHECKED_IN"] } }, { projection: { outlet_id: 1 } })
      .toArray();
    active.forEach((booking: any) => {
      bucketFor(booking.outlet_id ?? "UNKNOWN").active_bookings += 1;
    });

    // Payments belong to the period in which they were received, not the period the booking was made.
    const paid = await bookingsCollection
      .find({ ...bookingsFilter, status: "CHECKED_OUT", payments: { $exists: true, $ne: [] }, ...inRange("paid_at") })
      .toArray();
    paid.forEach((booking: any) => {
      const bucket = bucketFor(booking.outlet_id ?? "UNKNOWN");
      for (const payment of booking.payments) {
        const mode = String(payment?.mode ?? "OTHER");
        bucket.payments_by_mode[mode] = (bucket.payments_by_mode[mode] ?? 0) + toNumber(payment?.amount);
        bucket.payment_counts[mode] = (bucket.payment_counts[mode] ?? 0) + 1;
      }
      bucket.gst_collected += toNumber(booking.gst?.gst);
    });

    const roomsFilter = !user.outlets.includes("all") ? { outlet_id: { $in: user.outlets } } : {};
    const rooms = await roomsCollection.find({ is_active: { $ne: false }, ...roomsFilter }).toArray();
    rooms.forEach((room: any) => {
      const outletId = room.outlet_id ?? "UNKNOWN";
      if (!buckets.has(outletId)) {
        buckets.set(outletId, {
          outlet_id: outletId,
          outlet_name: outletId,
          total_orders: 0,
          total_revenue: 0,
          today_orders: 0,
          total_bookings: 0,
          active_bookings: 0,
          total_rooms: 0,
          total_tables: 0,
          food_revenue: 0,
          payments_by_mode: {},
          payment_counts: {},
          gst_collected: 0,
        });
      }
      const bucket = buckets.get(outletId)!;
      const type = (room.type ?? "").toString().toUpperCase();
      if (type === "ROOM" || type === "HOTEL_ROOM") bucket.total_rooms += 1;
      if (type === "TABLE") bucket.total_tables += 1;
    });

    const analytics = Array.from(buckets.values()).sort((a, b) =>
      a.outlet_name.localeCompare(b.outlet_name, "en", { sensitivity: "base" })
    );

    return {
      outlets: analytics,
      range: range ? { from: request.from, to: request.to } : null,
    };
  }
}

export const analyticsService = new AnalyticsService();
