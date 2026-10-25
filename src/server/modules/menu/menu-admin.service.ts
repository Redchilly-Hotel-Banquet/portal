import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { normalizeDocument } from "../../utils/normalizers";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { parseImageDataUrl, r2 } from "../../storage/r2";
import { ObjectId } from "mongodb";

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

/**
 * Menu photos live in R2 under Menu/<item id>-<timestamp>.<ext> and the item stores the public URL.
 * Pasted http(s) URLs are kept as given. The timestamp makes a replaced photo a new URL, so caches never serve the old one.
 */
const storeImage = async (itemId: Id, value: string): Promise<string> => {
  if (!value.startsWith("data:")) return value;
  const { mimeType, extension, bytes } = parseImageDataUrl(value);
  const key = `Menu/${String(itemId)}-${Date.now()}.${extension}`;
  await r2.put(key, bytes, mimeType);
  return r2.publicUrl(key);
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
        const _id = new ObjectId();
        if (typeof data.image_url === "string") data.image_url = await storeImage(_id, data.image_url);
        const doc = { _id, is_available: true, is_veg: true, ...data, created_at: now, updated_at: now };
        const result = await collection.insertOne(doc);
        return present({ _id: result.insertedId, ...doc });
      }
      case "update": {
        if (!request.id) throw new HttpError(400, "id is required for update action");
        const data = sanitise(request.data ?? {}, false);
        const id = resolveId(request.id);
        const existing = await collection.findOne({ _id: id });
        if (!existing) throw new HttpError(404, "Menu item not found");
        if (typeof data.image_url === "string") data.image_url = await storeImage(id, data.image_url);
        await collection.updateOne({ _id: id }, { $set: { ...data, updated_at: new Date() } });
        if (typeof data.image_url === "string" && data.image_url !== existing.image_url) {
          const previous = r2.keyFromPublicUrl(existing.image_url);
          if (previous) await r2.remove(previous);
        }
        return { success: true };
      }
      case "delete": {
        if (!request.id) throw new HttpError(400, "id is required for delete action");
        const removed = await collection.findOneAndDelete({ _id: resolveId(request.id) });
        if (!removed) throw new HttpError(404, "Menu item not found");
        const previous = r2.keyFromPublicUrl(removed.image_url);
        if (previous) await r2.remove(previous);
        return { success: true };
      }
      default:
        throw new HttpError(400, "Invalid action");
    }
  },
};
