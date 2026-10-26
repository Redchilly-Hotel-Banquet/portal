import { ObjectId } from "mongodb";
import { HttpError } from "../../httpError";
import { canAccessOutlet } from "../../utils/access";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { assignedRoomIds } from "../../utils/roomAssignments";

type PhoneOrderRequest = {
  action?: "stays" | "create";
  bookingId?: string;
  /** Which of the booking's rooms to deliver to. Defaults to its first room. */
  roomId?: string;
  specialInstructions?: string;
  /** Already served: goes straight to Delivered, so the kitchen is not alerted and it only joins the bill. */
  delivered?: boolean;
  items?: Array<{ id?: string; quantity?: number; notes?: string }>;
};

const MAX_QTY = 50;
const MAX_LINES = 40;

const outletAllowed = canAccessOutlet;

/**
 * Food a guest orders by phone. Reception or the kitchen records it against the guest's booking so it
 * reaches the kitchen and the invoice like any other order. Prices come from the menu, never the caller.
 */
export const phoneOrderService = {
  async handle(request: PhoneOrderRequest, user: AuthenticatedUser) {
    const db = mongoConnection.getDb();
    if (request?.action === "stays") return this.stays(db, user);
    if (request?.action === "create") return this.create(db, request, user);
    throw new HttpError(400, "Invalid action");
  },

  /** Guests currently checked in, with the rooms they hold, for the branches this user may serve. */
  async stays(db: ReturnType<typeof mongoConnection.getDb>, user: AuthenticatedUser) {
    const bookings = await db
      .collection("bookings")
      .find({ status: "CHECKED_IN", ...(user.outlets.includes("all") ? {} : { outlet_id: { $in: user.outlets } }) })
      .project({ guest_name: 1, booking_code: 1, outlet_id: 1, room_id: 1, room_ids: 1, rooms_allocated: 1, checkin_details: 1 })
      .toArray();

    const roomIds = Array.from(new Set(bookings.flatMap((booking) => assignedRoomIds(booking))));
    const rooms = roomIds.length
      ? await db
          .collection("rooms_tables")
          .find({ _id: { $in: roomIds.flatMap((id) => [id, toObjectId(id)].filter(Boolean)) } } as any, { projection: { code: 1 } })
          .toArray()
      : [];
    const codeById = new Map(rooms.map((room) => [String(room._id), String(room.code ?? "")]));

    return {
      stays: bookings
        .map((booking) => ({
          bookingId: stringifyId(booking._id) ?? "",
          bookingCode: booking.booking_code ?? "",
          guestName: booking.guest_name ?? "",
          outletId: booking.outlet_id ?? "",
          rooms: assignedRoomIds(booking).map((id) => ({ id, code: codeById.get(id) ?? "" })),
        }))
        .filter((stay) => stay.bookingId && stay.rooms.length > 0),
    };
  },

  async create(db: ReturnType<typeof mongoConnection.getDb>, request: PhoneOrderRequest, user: AuthenticatedUser) {
    const bookingId = String(request.bookingId ?? "").trim();
    const booking = bookingId
      ? await db.collection("bookings").findOne({ _id: (toObjectId(bookingId) ?? bookingId) as any })
      : null;
    if (!booking || !outletAllowed(user, booking.outlet_id)) throw new HttpError(404, "Booking not found");
    if (String(booking.status).toUpperCase() !== "CHECKED_IN") {
      throw new HttpError(409, "Orders can only be added for guests who are checked in.");
    }

    const held = assignedRoomIds(booking);
    const roomId = request.roomId ? String(request.roomId) : held[0];
    if (!roomId || !held.includes(roomId)) throw new HttpError(400, "Choose one of the rooms this booking holds.");

    const requested = (Array.isArray(request.items) ? request.items : []).slice(0, MAX_LINES);
    const lines = new Map<string, { quantity: number; notes: string | null }>();
    for (const entry of requested) {
      const id = String(entry?.id ?? "").trim();
      const quantity = Math.floor(Number(entry?.quantity));
      if (!id || !Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QTY) {
        throw new HttpError(400, `Each item needs a quantity from 1 to ${MAX_QTY}.`);
      }
      const notes = typeof entry?.notes === "string" ? entry.notes.trim().slice(0, 200) : "";
      const existing = lines.get(id);
      lines.set(id, { quantity: Math.min((existing?.quantity ?? 0) + quantity, MAX_QTY), notes: notes || existing?.notes || null });
    }
    if (lines.size === 0) throw new HttpError(400, "Add at least one item.");

    const menuDocs = await db
      .collection("menu_items")
      .find({ _id: { $in: Array.from(lines.keys()).flatMap((id) => [id, toObjectId(id)].filter(Boolean)) } } as any)
      .toArray();
    const menuById = new Map(menuDocs.map((doc) => [String(doc._id), doc]));

    let subtotal = 0;
    const orderItems = [] as Array<Record<string, unknown>>;
    for (const [id, line] of lines) {
      const menu = menuById.get(id);
      if (!menu) throw new HttpError(400, "One of the items is no longer on the menu.");
      if (String(menu.outlet_id) !== String(booking.outlet_id)) {
        throw new HttpError(400, `${menu.name ?? "An item"} is not on this branch's menu.`);
      }
      const price = Number(menu.price ?? menu.base_price ?? 0);
      subtotal += price * line.quantity;
      orderItems.push({ menu_item_id: menu._id, quantity: line.quantity, price, notes: line.notes });
    }
    subtotal = Math.round(subtotal * 100) / 100;

    const now = new Date();
    const orderId = new ObjectId();
    await db.collection("orders").insertOne({
      _id: orderId,
      outlet_id: booking.outlet_id,
      room_table_id: roomId,
      booking_id: stringifyId(booking._id),
      special_instructions: typeof request.specialInstructions === "string" ? request.specialInstructions.trim().slice(0, 500) || null : null,
      subtotal,
      total: subtotal,
      status: request.delivered ? "DELIVERED" : "PENDING",
      ...(request.delivered ? { delivered_at: now } : {}),
      source: "PHONE",
      placed_by: { id: user.id, name: user.name },
      created_at: now,
      updated_at: now,
    } as any);
    await db.collection("order_items").insertMany(
      orderItems.map((item) => ({ ...item, order_id: orderId.toHexString(), created_at: now })) as any,
    );
    return { orderId: orderId.toHexString(), total: subtotal };
  },
};
