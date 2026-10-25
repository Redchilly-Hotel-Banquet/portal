export type OutletAnalytics = {
  outlet_id: string;
  outlet_name: string;
  total_orders: number;
  total_revenue: number;
  food_revenue: number;
  today_orders: number;
  total_bookings: number;
  active_bookings: number;
  total_rooms: number;
  total_tables: number;
  /** Received at check-out, by payment source. */
  payments_by_mode?: Record<string, number>;
  payment_counts?: Record<string, number>;
  gst_collected?: number;
};

export type AnalyticsTotals = {
  orders: number;
  revenue: number;
  food: number;
  room: number;
  today: number;
  bookings: number;
  active: number;
  rooms: number;
  tables: number;
  foodShare: number;
};

export type SortKey = "revenue" | "orders" | "bookings" | "name";

export const toNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const roomRevenue = (o: OutletAnalytics) => Math.max(0, toNumber(o.total_revenue) - toNumber(o.food_revenue));

export const sumOutlets = (outlets: OutletAnalytics[]): AnalyticsTotals => {
  const t = outlets.reduce(
    (acc, o) => {
      acc.orders += toNumber(o.total_orders);
      acc.revenue += toNumber(o.total_revenue);
      acc.food += toNumber(o.food_revenue);
      acc.today += toNumber(o.today_orders);
      acc.bookings += toNumber(o.total_bookings);
      acc.active += toNumber(o.active_bookings);
      acc.rooms += toNumber(o.total_rooms);
      acc.tables += toNumber(o.total_tables);
      return acc;
    },
    { orders: 0, revenue: 0, food: 0, today: 0, bookings: 0, active: 0, rooms: 0, tables: 0 },
  );
  return {
    ...t,
    room: Math.max(0, t.revenue - t.food),
    foodShare: t.revenue ? (t.food / t.revenue) * 100 : 0,
  };
};

export const ANALYTICS_QUERY_KEY = ["outlet-analytics"] as const;
