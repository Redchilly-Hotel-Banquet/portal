import type { ObjectId } from "mongodb";
import { mongoConnection } from "../../mongo";
import { outletKeyOf } from "../../utils/outlets";
import { toObjectId } from "../../utils/objectId";
import { sendWhatsapp } from "../../whatsapp";
import { DEFAULT_ORDER_ALERT_TEMPLATE, renderTemplate } from "../../../lib/whatsapp-template";
import { configService } from "../config/config.service";
import { pushToKitchen } from "../../push/fcm";

type AlertOrder = {
  orderId?: unknown;
  outletId: ObjectId;
  locationId: unknown;
  specialInstructions?: string | null;
  total: number;
  items: Array<{ id: string; quantity: number; notes?: string | null }>;
};

/**
 * Tells the configured WhatsApp numbers about an order that reached the kitchen from outside the admin portal
 * (a guest ordering). Failures are logged and swallowed so they never block the order.
 */
export async function notifyNewOrder(order: AlertOrder): Promise<void> {
  try {
    const { numbers, template } = await configService.getOrderAlerts();
    if (numbers.length === 0) return;

    const db = mongoConnection.getDb();
    const ids = order.items.flatMap((item) => [item.id, toObjectId(item.id)].filter(Boolean));
    const [menu, location, outlet] = await Promise.all([
      ids.length ? db.collection("menu_items").find({ _id: { $in: ids } } as any, { projection: { name: 1 } }).toArray() : [],
      order.locationId ? db.collection("rooms_tables").findOne({ _id: order.locationId as any }, { projection: { code: 1, name: 1 } }) : null,
      db.collection("outlets").findOne({ _id: order.outletId }, { projection: { name: 1 } }),
    ]);
    const nameById = new Map<string, string>((menu as Array<{ _id: unknown; name?: unknown }>).map((doc) => [String(doc._id), String(doc.name ?? "Item")]));

    const lines = order.items.map((item) => `• ${item.quantity} x ${nameById.get(String(item.id)) ?? "Item"}${item.notes ? ` (${item.notes})` : ""}`);
    const where = String(location?.code ?? location?.name ?? "").trim();
    const branch = String(outlet?.name ?? outletKeyOf(order.outletId) ?? "").trim();
    const message = renderTemplate(template.trim() || DEFAULT_ORDER_ALERT_TEMPLATE, {
      branch,
      location: where,
      items: lines.join("\n"),
      note: order.specialInstructions ? `Note: ${order.specialInstructions}` : "",
      total: String(order.total),
    });

    await sendWhatsapp(numbers, message);
  } catch (error) {
    console.error("[order-alert] could not send the kitchen alert", error);
  }
}

/** Pushes a guest order to the kitchen and admin phones running the staff app. Failures are logged and swallowed. */
export async function pushNewOrder(order: AlertOrder): Promise<void> {
  try {
    const db = mongoConnection.getDb();
    const location = order.locationId
      ? await db.collection("rooms_tables").findOne({ _id: order.locationId as any }, { projection: { code: 1, name: 1, type: 1 } })
      : null;
    const where = String(location?.code ?? location?.name ?? "").trim();
    const kind = String(location?.type ?? "").replace(/_/g, " ").toLowerCase();
    await pushToKitchen(outletKeyOf(order.outletId) ?? null, {
      kind: "order",
      id: String(order.orderId ?? ""),
      where: `${kind} ${where}`.trim(),
      items: String(order.items.length),
    });
  } catch (error) {
    console.error("[order-alert] could not push the kitchen alert", error);
  }
}
