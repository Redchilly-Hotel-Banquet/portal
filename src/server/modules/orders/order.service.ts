import { ObjectId } from "mongodb";
import { assertCheckinId, findCheckedInBookingForRoom, ownsBooking } from "../../utils/checkinId";
import { assertOutlet, outletFilter } from "../../utils/access";
import { businessDayStart } from "../../utils/dates";
import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { AuthenticatedUser } from "../../session";
import { stringifyId, toObjectId } from "../../utils/objectId";
import {
  AdminManageOrdersRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  GetGuestOrdersRequest,
  GetGuestOrdersResponse,
  GetOrderRequest,
} from "./order.types";

const serializeId = (input: unknown): string | null => {
  try {
    if (!input) return null;
    if (typeof input === "string") return input;
    if (input instanceof ObjectId) return input.toHexString();
    if (typeof input === "object" && "$oid" in (input as Record<string, unknown>)) {
      return (input as { $oid?: string }).$oid ?? null;
    }
    const asString = (input as { toString?: () => string })?.toString?.();
    if (asString && asString !== "[object Object]") return asString;
  } catch {
    // ignore
  }
  return null;
};

const resolveCollectionId = (value: unknown, message: string): string | ObjectId => {
  const objectId = toObjectId(value);
  if (objectId) return objectId;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  throw new HttpError(400, message);
};

type FlexibleId = string | ObjectId;

type BookingDocument = Record<string, unknown> & {
  _id?: FlexibleId;
  status?: string;
  outlet_id?: FlexibleId;
  room_id?: FlexibleId;
  room_ids?: FlexibleId[];
  rooms_allocated?: Array<Record<string, unknown>>;
  booking_code?: string;
};

type OrderDocument = Record<string, unknown> & {
  _id?: FlexibleId;
  booking_id?: FlexibleId | null;
  room_table_id?: FlexibleId | null;
  status?: string;
  outlet_id?: FlexibleId;
};

type RoomTableDocument = Record<string, unknown> & {
  _id?: FlexibleId;
  type?: unknown;
};

type OrderItemDocument = Record<string, unknown> & {
  _id?: FlexibleId;
  order_id?: string;
  menu_item_id?: FlexibleId;
};

type MenuItemDocument = Record<string, unknown> & {
  _id?: FlexibleId;
};

/**
 * Room orders belong to a stay, so reading or adding to them needs proof of the stay: the signed-in
 * account that owns the booking, or the stay's 6-digit check-in ID.
 */
const authoriseBooking = async (
  db: ReturnType<typeof mongoConnection.getDb>,
  bookingId: string,
  checkinId: unknown,
  user: AuthenticatedUser | null,
) => {
  const booking = await db
    .collection<BookingDocument>("bookings")
    .findOne({ _id: resolveCollectionId(bookingId, "Invalid booking id") });
  if (ownsBooking(booking, user)) return booking;
  await assertCheckinId(db, `booking:${bookingId}`, booking, checkinId);
  return booking;
};

export class OrderService {
  async createOrder(payload: CreateOrderRequest, user: AuthenticatedUser | null = null): Promise<CreateOrderResponse> {
    const { outletId, roomTableId, specialInstructions, items, subtotal } = payload;
    if (!outletId) {
      throw new HttpError(400, "Outlet ID is required to place an order");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpError(400, "Cart items are required to place an order");
    }

    const db = mongoConnection.getDb();
    const roomsCollection = db.collection<RoomTableDocument>("rooms_tables");
    const bookingsCollection = db.collection<BookingDocument>("bookings");
    const ordersCollection = db.collection<OrderDocument>("orders");
    const orderItemsCollection = db.collection<OrderItemDocument>("order_items");

    let location: any = null;
    if (roomTableId) {
      const asObjectId = toObjectId(roomTableId);
      if (asObjectId) {
        location = await roomsCollection.findOne({ _id: asObjectId });
      }
      if (!location) {
        location = await roomsCollection.findOne({ _id: roomTableId });
      }
    }

    // Rooms and tables must exist and belong to the outlet being ordered from.
    if (!location || (location.outlet_id && String(location.outlet_id) !== String(outletId))) {
      throw new HttpError(400, "Unknown room or table for this branch");
    }

    const isRoomOrder =
      (location.type ?? "").toString().toUpperCase() === "ROOM" ||
      (location.type ?? "").toString().toUpperCase() === "HOTEL_ROOM";

    let resolvedBookingId: string | null = null;
    if (isRoomOrder) {
      const roomIdString = serializeId(location._id) ?? "";
      // Only a checked-in stay can order to its room, and only with proof it is theirs. The booking is
      // found from the room, never taken from the request.
      const activeBooking = await findCheckedInBookingForRoom(db, roomIdString, String(outletId));
      if (!ownsBooking(activeBooking, user)) {
        await assertCheckinId(db, `room:${roomIdString}`, activeBooking, payload.checkinId);
      }
      resolvedBookingId = serializeId(activeBooking?._id);
    }

    const orderDoc = {
      outlet_id: outletId,
      room_table_id: roomTableId ?? null,
      booking_id: resolvedBookingId,
      special_instructions: specialInstructions || null,
      subtotal,
      total: subtotal,
      status: "PENDING",
      created_at: new Date(),
      updated_at: new Date(),
    };

    const insertResult = await ordersCollection.insertOne(orderDoc);
    const orderId = serializeId(insertResult.insertedId) ?? insertResult.insertedId.toString();

    const orderItems = items.map((item) => ({
      order_id: orderId,
      menu_item_id: toObjectId(item.id) ?? item.id,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.price ?? 0),
      notes: item.notes ?? null,
      created_at: new Date(),
    }));

    if (orderItems.length > 0) {
      await orderItemsCollection.insertMany(orderItems);
    }

    return { orderId, bookingId: resolvedBookingId };
  }

  async getGuestOrders(payload: GetGuestOrdersRequest, user: AuthenticatedUser | null = null): Promise<GetGuestOrdersResponse> {
    const { bookingId } = payload;
    if (!bookingId) {
      throw new HttpError(400, "Booking id is required");
    }

    const db = mongoConnection.getDb();
    await authoriseBooking(db, bookingId, payload.checkinId, user);
    const ordersCollection = db.collection<OrderDocument>("orders");
    const roomsCollection = db.collection<RoomTableDocument>("rooms_tables");
    const orderItemsCollection = db.collection<OrderItemDocument>("order_items");
    const menuItemsCollection = db.collection<MenuItemDocument>("menu_items");
    const orders = await ordersCollection
      .find({ booking_id: { $in: [bookingId, toObjectId(bookingId)].filter(Boolean) } })
      .sort({ created_at: -1 })
      .toArray();

    // Rooms, order items and menu items are fetched in bulk, not once per order.
    const orderIds = orders.map((order) => serializeId(order._id)).filter((id): id is string => Boolean(id));
    const roomIds = Array.from(new Set(orders.map((order) => order.room_table_id).filter(Boolean).map((id) => String(id))));
    const [rooms, allItems] = await Promise.all([
      roomIds.length
        ? roomsCollection.find({ _id: { $in: roomIds.flatMap((id) => [id, toObjectId(id)].filter(Boolean) as FlexibleId[]) } }).toArray()
        : [],
      orderIds.length ? orderItemsCollection.find({ order_id: { $in: orderIds } }).toArray() : [],
    ]);
    const roomsById = new Map<string, any>((rooms as any[]).map((room) => [serializeId(room._id) ?? "", room]));
    const menuItemIds = Array.from(new Set(allItems.map((it) => toObjectId(it.menu_item_id)).filter((id): id is ObjectId => Boolean(id))));
    const menuItems = menuItemIds.length ? await menuItemsCollection.find({ _id: { $in: menuItemIds } }).toArray() : [];
    const menuItemsById = new Map<string, unknown>(menuItems.map((mi) => [serializeId(mi._id) ?? "", mi]));
    const itemsByOrder = new Map<string, OrderItemDocument[]>();
    for (const item of allItems) {
      const list = itemsByOrder.get(String(item.order_id)) ?? [];
      list.push(item);
      itemsByOrder.set(String(item.order_id), list);
    }

    const enrichedOrders = [] as any[];
    for (const order of orders) {
      const orderId = serializeId(order._id);
      if (!orderId) continue;
      const serializedItems = (itemsByOrder.get(orderId) ?? []).map((item) => ({
        ...item,
        id: serializeId(item._id),
        menu_items: menuItemsById.get(serializeId(item.menu_item_id) ?? "") ?? null,
      }));

      enrichedOrders.push({
        ...order,
        id: orderId,
        _id: orderId,
        booking_id: serializeId(order.booking_id),
        room_table_id: order.room_table_id ? serializeId(order.room_table_id) : null,
        rooms_tables: order.room_table_id ? roomsById.get(String(order.room_table_id)) ?? null : null,
        order_items: serializedItems,
      });
    }

    return { orders: enrichedOrders };
  }

  async getOrder(payload: GetOrderRequest, user: AuthenticatedUser | null = null) {
    const { orderId, bookingId } = payload;
    if (!orderId) {
      throw new HttpError(400, "Order ID is required");
    }

    const db = mongoConnection.getDb();
    const ordersCollection = db.collection<OrderDocument>("orders");
    const orderItemsCollection = db.collection<OrderItemDocument>("order_items");
    const roomsCollection = db.collection<RoomTableDocument>("rooms_tables");
    const menuItemsCollection = db.collection<MenuItemDocument>("menu_items");
    const filter = { _id: resolveCollectionId(orderId, "Invalid order id") } as {
      _id: FlexibleId;
      booking_id?: string;
    };
    if (bookingId) {
      filter.booking_id = bookingId;
    }

    const order = await ordersCollection.findOne(filter);
    if (!order) {
      throw new HttpError(404, "Order not found");
    }

    const orderBookingId = serializeId(order.booking_id) ?? "";
    if (bookingId && orderBookingId && orderBookingId !== bookingId) {
      throw new HttpError(400, "Order does not belong to this booking");
    }
    // Room orders are private to the stay. Table orders have no booking and stay readable by their id.
    if (orderBookingId) await authoriseBooking(db, orderBookingId, payload.checkinId, user);

    const orderItems = await orderItemsCollection.find({ order_id: orderId }).toArray();
    const menuItemIds = orderItems
      .map((item) => toObjectId(item.menu_item_id))
      .filter((id): id is ObjectId => Boolean(id));

    const menuItems = menuItemIds.length
      ? await menuItemsCollection.find({ _id: { $in: menuItemIds } }).toArray()
      : [];

    let roomTable = null;
    if (order.room_table_id) {
      const resolvedRoomId = resolveCollectionId(order.room_table_id, "Invalid room id");
      roomTable = await roomsCollection.findOne({ _id: resolvedRoomId });
    }

    const enrichedOrderItems = orderItems.map((item) => {
      const menuItem = menuItems.find((mi) => serializeId(mi._id) === serializeId(item.menu_item_id));
      return { ...item, menu_items: menuItem };
    });

    return {
      ...order,
      id: serializeId(order._id) ?? "",
      order_items: enrichedOrderItems,
      rooms_tables: roomTable,
      booking_id: orderBookingId || null,
      room_table_id: serializeId(order.room_table_id) ?? order.room_table_id ?? null,
    };
  }

  async adminManage(payload: AdminManageOrdersRequest, user: AuthenticatedUser) {
    if (!user.roles.includes("admin") && !user.roles.includes("kitchen")) {
      throw new HttpError(403, "Insufficient permissions to manage orders");
    }

    const db = mongoConnection.getDb();
    const ordersCollection = db.collection<OrderDocument>("orders");
    const roomsCollection = db.collection<RoomTableDocument>("rooms_tables");
    const orderItemsCollection = db.collection<OrderItemDocument>("order_items");
    const menuItemsCollection = db.collection<MenuItemDocument>("menu_items");

    switch (payload.action) {
      case "list": {
        const dayStart = businessDayStart();
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

        const filter: Record<string, unknown> = {
          created_at: {
            $gte: dayStart,
            $lt: dayEnd,
          },
        };

        Object.assign(filter, outletFilter(user));

        const orders = await ordersCollection.find(filter).sort({ created_at: -1 }).toArray();
        // Bulk lookups rather than three queries per order; the kitchen screen polls this list.
        const orderIds = orders.map((order) => serializeId(order._id) ?? "").filter(Boolean);
        const roomIds = Array.from(new Set(orders.map((order) => order.room_table_id).filter(Boolean).map((id) => String(id))));
        const [rooms, allItems] = await Promise.all([
          roomIds.length
            ? roomsCollection.find({ _id: { $in: roomIds.flatMap((id) => [id, toObjectId(id)].filter(Boolean) as FlexibleId[]) } }).toArray()
            : [],
          orderIds.length ? orderItemsCollection.find({ order_id: { $in: orderIds } }).toArray() : [],
        ]);
        const roomsById = new Map<string, any>((rooms as any[]).map((room) => [serializeId(room._id) ?? "", room]));
        const menuIds = Array.from(new Set(allItems.map((item) => item.menu_item_id).filter(Boolean).map((id) => String(id))));
        const menuDocs = menuIds.length
          ? await menuItemsCollection.find({ _id: { $in: menuIds.flatMap((id) => [id, toObjectId(id)].filter(Boolean) as FlexibleId[]) } }).toArray()
          : [];
        const menuById = new Map<string, any>(menuDocs.map((doc) => [serializeId(doc._id) ?? "", doc]));
        for (const item of allItems) {
          item.menu_items = item.menu_item_id ? menuById.get(String(item.menu_item_id)) ?? null : null;
        }
        const itemsByOrder = new Map<string, OrderItemDocument[]>();
        for (const item of allItems) {
          const list = itemsByOrder.get(String(item.order_id)) ?? [];
          list.push(item);
          itemsByOrder.set(String(item.order_id), list);
        }
        for (const order of orders) {
          // Only where to deliver it: the kitchen has no use for a room's rates or amenities.
          const room = order.room_table_id ? roomsById.get(String(order.room_table_id)) : null;
          if (order.room_table_id) order.rooms_tables = room ? { _id: room._id, type: room.type, code: room.code } : null;
          order.order_items = itemsByOrder.get(serializeId(order._id) ?? "") ?? [];
        }
        return orders;
      }
      case "update_status": {
        if (!payload.id || !payload.status) {
          throw new HttpError(400, "id and status are required");
        }
        if (!["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED"].includes(String(payload.status))) {
          throw new HttpError(400, "Invalid status");
        }
        const filter = { _id: resolveCollectionId(payload.id, "Invalid order id") };
        const target = await ordersCollection.findOne(filter);
        if (!target) throw new HttpError(404, "Order not found");
        assertOutlet(user, target.outlet_id);
        await ordersCollection.updateOne(filter, {
          $set: {
            status: payload.status,
            updated_at: new Date(),
          },
        });
        return { success: true };
      }
      default:
        throw new HttpError(400, "Invalid action");
    }
  }
}

export const orderService = new OrderService();
