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

export class AnalyticsService {
  async getOutletAnalytics(user: AuthenticatedUser) {
    if (!user.roles.includes("admin")) {
      throw new HttpError(403, "Insufficient permissions to view analytics");
    }

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

    const orders = await ordersCollection.find(outletFilter).toArray();
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
    const bookings = await bookingsCollection.find(bookingsFilter).toArray();
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
        });
      }
      const bucket = buckets.get(outletId)!;
      bucket.total_bookings += 1;
      if (["CONFIRMED", "CHECKED_IN"].includes(booking.status)) {
        bucket.active_bookings += 1;
      }
      bucket.total_revenue += toNumber(booking.total_amount);
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

    return { outlets: analytics };
  }
}

export const analyticsService = new AnalyticsService();
