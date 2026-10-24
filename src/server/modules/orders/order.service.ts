import { ObjectId } from "mongodb";
import { assignedRoomIds } from "../../utils/roomAssignments";
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

export class OrderService {
  async createOrder(payload: CreateOrderRequest): Promise<CreateOrderResponse> {
    const { outletId, roomTableId, bookingId, specialInstructions, items, subtotal } = payload;
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

    const isRoomOrder =
      (location?.type ?? "").toString().toUpperCase() === "ROOM" ||
      (location?.type ?? "").toString().toUpperCase() === "HOTEL_ROOM";

    let resolvedBookingId: string | null = null;
    if (isRoomOrder) {
      const activeStatuses = ["PENDING", "CONFIRMED", "CHECKED_IN"];
      let activeBooking: any = null;

      if (bookingId) {
        activeBooking = await bookingsCollection.findOne({
          _id: resolveCollectionId(bookingId, "Invalid booking id"),
          status: { $in: activeStatuses },
        });
      }

      if (!activeBooking) {
        const now = new Date();
        const roomIdString = serializeId(location?._id) ?? String(location?._id ?? "");
        const candidates = [roomIdString, roomTableId].filter(Boolean).map((value) => String(value));

        const possible = await bookingsCollection.find({
          outlet_id: outletId,
          status: { $in: activeStatuses },
          $and: [
            {
              $or: [
                { room_id: { $in: candidates } },
                { room_ids: { $in: candidates } },
                { "rooms_allocated.room_id": { $in: candidates } },
              ],
            },
            {
              $or: [
                { check_in_date: { $lte: now }, check_out_date: { $gte: now } },
                { check_in_date: { $exists: false } },
              ],
            },
          ],
        }).toArray();
        // Several bookings can mention a room; the one that actually holds it is the one that counts.
        activeBooking = possible.find((entry) => assignedRoomIds(entry).includes(roomIdString)) ?? null;
      }

      if (!activeBooking) {
        throw new HttpError(400, "No active booking found for this room. Please contact the front desk.");
      }

      const locationRoomId = serializeId(location?._id) ?? "";
      // Only rooms the booking really holds count; an un-assigned room left on the document does not.
      const matchesRoom = !locationRoomId || assignedRoomIds(activeBooking).includes(locationRoomId);

      if (!matchesRoom) {
        throw new HttpError(400, "This booking is tied to a different room.");
      }

      resolvedBookingId = serializeId(activeBooking._id);
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

  async getGuestOrders(payload: GetGuestOrdersRequest): Promise<GetGuestOrdersResponse> {
    const { bookingId } = payload;
    if (!bookingId) {
      throw new HttpError(400, "Booking id is required");
    }

    const db = mongoConnection.getDb();
    const ordersCollection = db.collection<OrderDocument>("orders");
    const roomsCollection = db.collection<RoomTableDocument>("rooms_tables");
    const orderItemsCollection = db.collection<OrderItemDocument>("order_items");
    const menuItemsCollection = db.collection<MenuItemDocument>("menu_items");
    const orders = await ordersCollection
      .find({ booking_id: { $in: [bookingId, toObjectId(bookingId)].filter(Boolean) } })
      .sort({ created_at: -1 })
      .toArray();

    const enrichedOrders = [] as any[];

    for (const order of orders) {
      const orderId = serializeId(order._id);
      if (!orderId) continue;

      let roomTable = null;
      if (order.room_table_id) {
        const resolvedRoomId = resolveCollectionId(order.room_table_id, "Invalid room id");
        roomTable = await roomsCollection.findOne({ _id: resolvedRoomId });
      }

      const orderItems = await orderItemsCollection.find({ order_id: orderId }).toArray();
      const menuItemIds = orderItems
        .map((it) => toObjectId(it.menu_item_id))
        .filter((id): id is ObjectId => Boolean(id));

      let menuItemsById = new Map<string, unknown>();
      if (menuItemIds.length > 0) {
        const menuItems = await menuItemsCollection.find({ _id: { $in: menuItemIds } }).toArray();
        menuItemsById = new Map(menuItems.map((mi) => [serializeId(mi._id) ?? "", mi]));
      }

      const serializedItems = orderItems.map((item) => ({
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
        rooms_tables: roomTable,
        order_items: serializedItems,
      });
    }

    return { orders: enrichedOrders };
  }

  async getOrder(payload: GetOrderRequest) {
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
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(3, 0, 0, 0);
        if (now < dayStart) {
          dayStart.setDate(dayStart.getDate() - 1);
        }
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const filter: Record<string, unknown> = {
          created_at: {
            $gte: dayStart,
            $lt: dayEnd,
          },
        };

        if (!user.outlets.includes("all")) {
          filter.outlet_id = { $in: user.outlets };
        }

        const orders = await ordersCollection.find(filter).sort({ created_at: -1 }).toArray();
        for (const order of orders) {
          if (order.room_table_id) {
            const roomTable = await roomsCollection.findOne({
              _id: resolveCollectionId(order.room_table_id, "Invalid room id"),
            });
            order.rooms_tables = roomTable;
          }

          const orderItems = await orderItemsCollection
            .find({ order_id: serializeId(order._id) ?? "" })
            .toArray();
          for (const item of orderItems) {
            if (item.menu_item_id) {
              const menuItem = await menuItemsCollection.findOne({
                _id: resolveCollectionId(item.menu_item_id, "Invalid menu item id"),
              });
              item.menu_items = menuItem;
            } else {
              item.menu_items = null;
            }
          }
          order.order_items = orderItems;
        }
        return orders;
      }
      case "update_status": {
        if (!payload.id || !payload.status) {
          throw new HttpError(400, "id and status are required");
        }
        const filter = { _id: resolveCollectionId(payload.id, "Invalid order id") };
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
