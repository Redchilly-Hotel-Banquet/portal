import { ObjectId } from "mongodb";
import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import type { AuthenticatedUser } from "../../session";
import { tenDigitPhone } from "../../../lib/phone";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GUESTS_ON_SCREEN = 50;
const TOP_ITEMS = 15;

export type InsightsRequest = { view?: "guests" | "trends"; from?: string | null; to?: string | null; /** Branch keys to include; empty or missing means every branch the account may see. */ outlets?: unknown };

const MAX_TREND_DAYS = 366;
/** Up to this many days are charted per day; longer ranges per month. */
const DAILY_UP_TO_DAYS = 92;

/** Only what the analytics read; whole booking documents carry the check-in details. */
const BOOKING_FIELDS = {
  outlet_id: 1, status: 1, created_at: 1, total_amount: 1, checkout_room_total: 1, nights: 1, user_id: 1,
  guest_name: 1, guest_phone: 1, guest_email: 1, payments: 1, preferred_room_type: 1, preferred_categories: 1,
  "checkin_details.assigned_rooms": 1,
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const bump = (map: Record<string, number>, key: string, by: number) => {
  map[key] = (map[key] ?? 0) + by;
};

const isCancelled = (status: unknown) => /CANCEL|REJECT/i.test(String(status ?? ""));

/** What the room side of a booking brought in. A finished stay is what was billed at check-out. */
const roomAmount = (booking: any): number =>
  String(booking.status).toUpperCase() === "CHECKED_OUT" && booking.checkout_room_total !== undefined
    ? num(booking.checkout_room_total)
    : num(booking.total_amount);

/** Room categories the guest actually stayed in; falls back to what they asked for. */
const roomTypesOf = (booking: any): string[] => {
  const assigned: any[] = Array.isArray(booking.checkin_details?.assigned_rooms) ? booking.checkin_details.assigned_rooms : [];
  const fromRooms = assigned.map((room) => String(room?.room_type ?? room?.type ?? "").trim()).filter(Boolean);
  if (fromRooms.length) return fromRooms;
  const categories = booking.preferred_categories && typeof booking.preferred_categories === "object" ? Object.keys(booking.preferred_categories) : [];
  if (categories.length) return categories;
  const preferred = String(booking.preferred_room_type ?? "").trim();
  return [preferred || "Not specified"];
};

const parseDay = (value: unknown): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(utc).getUTCDate() === Number(match[3]) ? utc : null;
};

/** The request's days as instants in India time; null when no range was given (everything). */
export const parseWindow = (fromRaw: unknown, toRaw: unknown) => {
  const fromDay = parseDay(fromRaw);
  const toDay = parseDay(toRaw);
  if (fromDay === null || toDay === null) throw new HttpError(400, "Choose a valid start and end date.");
  if (toDay < fromDay) throw new HttpError(400, "The end date must be on or after the start date.");
  const days = Math.round((toDay - fromDay) / DAY_MS) + 1;
  if (days > MAX_TREND_DAYS) throw new HttpError(400, "Choose a period of at most 1 year.");
  return { fromDay, toDay, days, from: new Date(fromDay - IST_OFFSET_MS), to: new Date(toDay + DAY_MS - IST_OFFSET_MS) };
};

export const GUESTS_EXPORT_LIMIT = 5000;

export class InsightsService {
  async get(user: AuthenticatedUser, request: InsightsRequest = {}) {
    if (!user.roles.includes("admin")) throw new HttpError(403, "Insufficient permissions to view analytics");
    const outlets = Array.isArray(request.outlets) ? request.outlets.map((key) => String(key)).filter(Boolean) : [];
    if (request.view === "guests") return this.guests(user, parseWindow(request.from, request.to)!, outlets, GUESTS_ON_SCREEN);
    if (request.view === "trends") return this.trends(user, parseWindow(request.from, request.to)!, outlets);
    throw new HttpError(400, "Unknown analytics view");
  }

  /** The account's branches, narrowed to the ones chosen in the filter (never widened past what it may see). */
  private scope(user: AuthenticatedUser, window: { from: Date; to: Date } | null, chosen: string[]) {
    const allowed = user.outlets.includes("all") ? chosen : chosen.length ? chosen.filter((key) => user.outlets.includes(key)) : user.outlets;
    const outlet = user.outlets.includes("all") && chosen.length === 0 ? {} : { outlet_id: { $in: allowed } };
    return { ...outlet, ...(window ? { created_at: { $gte: window.from, $lt: window.to } } : {}) };
  }

  /** Food orders (not cancelled) for these bookings, as a map booking id -> orders. */
  private async ordersByBooking(bookingIds: string[]) {
    const db = mongoConnection.getDb();
    const byBooking = new Map<string, any[]>();
    for (let i = 0; i < bookingIds.length; i += 1000) {
      const chunk = bookingIds.slice(i, i + 1000);
      const orders = await db.collection("orders").find({ booking_id: { $in: chunk } }, { projection: { booking_id: 1, status: 1, total: 1, subtotal: 1 } }).toArray();
      for (const order of orders) {
        if (isCancelled(order.status)) continue;
        const key = String(order.booking_id);
        byBooking.set(key, [...(byBooking.get(key) ?? []), order]);
      }
    }
    return byBooking;
  }

  async guests(user: AuthenticatedUser, window: { from: Date; to: Date } | null, chosen: string[], limit: number) {
    const db = mongoConnection.getDb();
    const bookings = (await db.collection("bookings").find(this.scope(user, window, chosen), { projection: BOOKING_FIELDS }).sort({ created_at: -1 }).toArray()).filter(
      (booking) => !isCancelled(booking.status),
    );
    const orders = await this.ordersByBooking(bookings.map((booking) => String(booking._id)));

    type Guest = {
      key: string;
      name: string;
      phone: string;
      email: string;
      bookings: number;
      nights: number;
      room_types: Record<string, number>;
      room_spend: number;
      food_spend: number;
      food_orders: number;
      total_spend: number;
      payments: Record<string, number>;
      last_booking: unknown;
    };
    const guests = new Map<string, Guest>();

    for (const booking of bookings) {
      const phone = tenDigitPhone(booking.guest_phone);
      const email = String(booking.guest_email ?? "").trim().toLowerCase();
      const key = booking.user_id ? `u:${booking.user_id}` : phone ? `p:${phone}` : email ? `e:${email}` : `n:${String(booking.guest_name ?? "").trim().toLowerCase()}`;
      if (key === "n:") continue;
      const guest =
        guests.get(key) ??
        ({
          key,
          name: String(booking.guest_name ?? ""),
          phone: phone ?? String(booking.guest_phone ?? ""),
          email,
          bookings: 0,
          nights: 0,
          room_types: {},
          room_spend: 0,
          food_spend: 0,
          food_orders: 0,
          total_spend: 0,
          payments: {},
          last_booking: booking.created_at ?? null,
        } satisfies Guest);
      guest.bookings += 1;
      guest.nights += Math.max(num(booking.nights), 1);
      for (const type of roomTypesOf(booking)) bump(guest.room_types, type, 1);
      guest.room_spend += roomAmount(booking);
      for (const order of orders.get(String(booking._id)) ?? []) {
        guest.food_spend += num(order.total) || num(order.subtotal);
        guest.food_orders += 1;
      }
      for (const payment of Array.isArray(booking.payments) ? booking.payments : []) bump(guest.payments, String(payment?.mode ?? "OTHER"), num(payment?.amount));
      if (!guest.email && email) guest.email = email;
      guests.set(key, guest);
    }

    const all = Array.from(guests.values()).map((guest) => ({
      ...guest,
      room_spend: money(guest.room_spend),
      food_spend: money(guest.food_spend),
      total_spend: money(guest.room_spend + guest.food_spend),
      payments: Object.fromEntries(Object.entries(guest.payments).map(([mode, amount]) => [mode, money(amount)])),
    }));
    all.sort((a, b) => b.bookings - a.bookings || b.total_spend - a.total_spend);

    return {
      total_guests: all.length,
      repeat_guests: all.filter((guest) => guest.bookings > 1).length,
      guests: all.slice(0, limit),
    };
  }

  async trends(user: AuthenticatedUser, range: NonNullable<ReturnType<typeof parseWindow>>, chosen: string[]) {
    const db = mongoConnection.getDb();
    const { fromDay, toDay, days } = range;
    const window = { from: range.from, to: range.to };
    const unit: "day" | "month" = days <= DAILY_UP_TO_DAYS ? "day" : "month";
    const scope = this.scope(user, window, chosen);

    // One zero-filled bucket per day or month in the range, so quiet periods show as zero, not as gaps.
    const bucketKey = (date: Date): string => {
      const ist = new Date(date.getTime() + IST_OFFSET_MS).toISOString();
      return unit === "day" ? ist.slice(0, 10) : ist.slice(0, 7);
    };
    const series = new Map<string, { bucket: string; bookings: number; room_income: number; food_orders: number; food_income: number }>();
    for (let t = fromDay; t <= toDay; t += DAY_MS) {
      const key = new Date(t).toISOString().slice(0, unit === "day" ? 10 : 7);
      if (!series.has(key)) series.set(key, { bucket: key, bookings: 0, room_income: 0, food_orders: 0, food_income: 0 });
    }
    const slot = (date: Date) => series.get(bucketKey(date));

    const bookings = (await db.collection("bookings").find(scope, { projection: BOOKING_FIELDS }).toArray()).filter((booking) => !isCancelled(booking.status));
    const orders = (await db.collection("orders").find(scope, { projection: { outlet_id: 1, status: 1, total: 1, subtotal: 1, created_at: 1 } }).toArray()).filter((order) => !isCancelled(order.status));

    const roomTypes: Record<string, { bookings: number; income: number }> = {};
    const payments: Record<string, number> = {};
    const branches: Record<string, { bookings: number; room_income: number; food_orders: number; food_income: number }> = {};
    const branchOf = (id: unknown) => (branches[String(id ?? "UNKNOWN")] ??= { bookings: 0, room_income: 0, food_orders: 0, food_income: 0 });

    for (const booking of bookings) {
      const created = new Date(booking.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const amount = roomAmount(booking);
      const row = slot(created);
      if (!row) continue;
      row.bookings += 1;
      row.room_income += amount;
      const branch = branchOf(booking.outlet_id);
      branch.bookings += 1;
      branch.room_income += amount;
      const types = roomTypesOf(booking);
      for (const type of types) {
        const entry = (roomTypes[type] ??= { bookings: 0, income: 0 });
        entry.bookings += 1;
        entry.income += amount / types.length;
      }
      for (const payment of Array.isArray(booking.payments) ? booking.payments : []) bump(payments, String(payment?.mode ?? "OTHER"), num(payment?.amount));
    }

    for (const order of orders) {
      const created = new Date(order.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const amount = num(order.total) || num(order.subtotal);
      const row = slot(created);
      if (!row) continue;
      row.food_orders += 1;
      row.food_income += amount;
      const branch = branchOf(order.outlet_id);
      branch.food_orders += 1;
      branch.food_income += amount;
    }

    // Most sold dishes: quantities and sales from the order lines of this year's orders.
    const sold = new Map<string, { quantity: number; sales: number }>();
    const orderIds = orders.map((order) => String(order._id));
    for (let i = 0; i < orderIds.length; i += 1000) {
      const lines = await db.collection("order_items").find({ order_id: { $in: orderIds.slice(i, i + 1000) } }).toArray();
      for (const line of lines) {
        const key = String(line.menu_item_id);
        const entry = sold.get(key) ?? { quantity: 0, sales: 0 };
        entry.quantity += num(line.quantity);
        entry.sales += num(line.quantity) * num(line.price);
        sold.set(key, entry);
      }
    }
    const rawIds = Array.from(sold.keys());
    const menu = rawIds.length
      ? await db
          .collection("menu_items")
          .find({ _id: { $in: rawIds.flatMap((id) => { try { return [id, new ObjectId(id)]; } catch { return [id]; } }) } as any }, { projection: { name: 1, category: 1 } })
          .toArray()
      : [];
    const menuById = new Map(menu.map((doc: any) => [String(doc._id), doc]));
    // Dishes that have since been deleted from the menu are not listed, so there is no "Removed item" row.
    const liveIds = rawIds.filter((id) => menuById.has(id));
    const items = liveIds
      .map((id) => ({ name: String(menuById.get(id)?.name ?? ""), category: String(menuById.get(id)?.category ?? ""), ...sold.get(id)! }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, TOP_ITEMS);

    const categories: Record<string, number> = {};
    for (const id of liveIds) bump(categories, String(menuById.get(id)?.category ?? "Other") || "Other", sold.get(id)!.sales);

    const outlets = await db.collection("outlets").find({}).project({ location_key: 1, name: 1 }).toArray();
    const outletName = new Map(outlets.map((outlet: any) => [String(outlet.location_key), String(outlet.name ?? outlet.location_key)]));

    const roomIncome = bookings.reduce((sum, booking) => sum + roomAmount(booking), 0);
    const foodIncome = orders.reduce((sum, order) => sum + (num(order.total) || num(order.subtotal)), 0);
    const points = Array.from(series.values());
    const busiest = [...points].sort((a, b) => b.bookings - a.bookings)[0];

    return {
      from: new Date(fromDay).toISOString().slice(0, 10),
      to: new Date(toDay).toISOString().slice(0, 10),
      unit,
      totals: {
        bookings: bookings.length,
        room_income: money(roomIncome),
        food_orders: orders.length,
        food_income: money(foodIncome),
        income: money(roomIncome + foodIncome),
        busiest: busiest && busiest.bookings > 0 ? busiest.bucket : null,
      },
      series: points.map((row) => ({ ...row, room_income: money(row.room_income), food_income: money(row.food_income) })),
      room_types: Object.entries(roomTypes)
        .map(([type, entry]) => ({ type, bookings: entry.bookings, income: money(entry.income) }))
        .sort((a, b) => b.bookings - a.bookings),
      top_items: items.map((item) => ({ ...item, sales: money(item.sales) })),
      food_categories: Object.entries(categories)
        .map(([category, sales]) => ({ category, sales: money(sales) }))
        .sort((a, b) => b.sales - a.sales),
      payments: Object.entries(payments)
        .map(([mode, amount]) => ({ mode, amount: money(amount) }))
        .sort((a, b) => b.amount - a.amount),
      branches: Object.entries(branches)
        .map(([id, entry]) => ({
          outlet_id: id,
          outlet_name: outletName.get(id) ?? id,
          ...entry,
          room_income: money(entry.room_income),
          food_income: money(entry.food_income),
        }))
        .sort((a, b) => b.room_income + b.food_income - (a.room_income + a.food_income)),
    };
  }
}

export const insightsService = new InsightsService();
