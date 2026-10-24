import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { normalizeDocument } from "../../utils/normalizers";
import { stringifyId, toObjectId } from "../../utils/objectId";

type ManageMenuItemRequest = {
  action?: "list" | "create" | "update" | "delete";
  id?: string;
  data?: Record<string, unknown>;
};

type Id = string | import("mongodb").ObjectId;

const resolveId = (value: unknown): Id => {
  const objectId = toObjectId(value);
  if (objectId) return objectId;
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new HttpError(400, "Invalid menu item id");
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);

const money = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpError(400, "Price must be a positive number");
  return Math.round(parsed * 100) / 100;
};

/** Whitelists writable fields. The public menu and orders read `price`, the admin form sends `base_price`; keep both in step. */
const sanitise = (data: Record<string, unknown>, requireCore: boolean) => {
  const out: Record<string, unknown> = {};

  const name = text(data.name);
  if (requireCore && !name) throw new HttpError(400, "Name is required");
  if (name !== undefined) out.name = name;

  const price = money(data.base_price ?? data.price);
  if (requireCore && price === undefined) throw new HttpError(400, "Price is required");
  if (price !== undefined) {
    out.price = price;
    out.base_price = price;
  }

  for (const key of ["description", "category", "image_url", "category_id", "outlet_id"] as const) {
    const value = text(data[key]);
    if (value !== undefined) out[key] = value;
  }
  if (requireCore && (!out.category_id || !out.outlet_id)) {
    throw new HttpError(400, "Category and outlet are required");
  }

  if (data.prep_time_minutes !== undefined) {
    const minutes = Number(data.prep_time_minutes);
    if (!Number.isFinite(minutes) || minutes < 0) throw new HttpError(400, "Invalid preparation time");
    out.prep_time_minutes = Math.round(minutes);
  }
  if (typeof data.is_veg === "boolean") out.is_veg = data.is_veg;
  if (typeof data.is_available === "boolean") out.is_available = data.is_available;
  return out;
};

const present = (doc: Record<string, unknown>) => {
  const item = normalizeDocument(doc) as Record<string, unknown>;
  item.price = item.price ?? item.base_price ?? 0;
  for (const key of ["category_id", "outlet_id"]) {
    if (item[key]) item[key] = stringifyId(item[key]) ?? item[key];
  }
  return item;
};

export const menuAdminService = {
  async manage(request: ManageMenuItemRequest) {
    const collection = mongoConnection.getDb().collection<{ _id?: Id } & Record<string, unknown>>("menu_items");

    switch (request.action) {
      case "list": {
        const docs = await collection.find({}).sort({ created_at: -1 }).toArray();
        const items = docs.map(present);
        return { items, page: 1, pageSize: items.length, total: items.length, totalPages: 1 };
      }
      case "create": {
        const data = sanitise(request.data ?? {}, true);
        const now = new Date();
        const doc = { is_available: true, is_veg: true, ...data, created_at: now, updated_at: now };
        const result = await collection.insertOne(doc);
        return present({ _id: result.insertedId, ...doc });
      }
      case "update": {
        if (!request.id) throw new HttpError(400, "id is required for update action");
        const data = sanitise(request.data ?? {}, false);
        const result = await collection.updateOne(
          { _id: resolveId(request.id) },
          { $set: { ...data, updated_at: new Date() } },
        );
        if (!result.matchedCount) throw new HttpError(404, "Menu item not found");
        return { success: true };
      }
      case "delete": {
        if (!request.id) throw new HttpError(400, "id is required for delete action");
        const result = await collection.deleteOne({ _id: resolveId(request.id) });
        if (!result.deletedCount) throw new HttpError(404, "Menu item not found");
        return { success: true };
      }
      default:
        throw new HttpError(400, "Invalid action");
    }
  },
};
