import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { normalizeDocument } from "../../utils/normalizers";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { ManageOutletRequest, ManageOutletAction } from "./outlet.types";

type FlexibleId = string | import("mongodb").ObjectId;

type OutletDocument = {
  _id?: FlexibleId;
} & Record<string, unknown>;

const resolveOutletId = (value: unknown): FlexibleId => {
  const objectId = toObjectId(value);
  if (objectId) return objectId;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  throw new HttpError(400, "Invalid outlet id");
};

const toStringOrEmpty = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const toBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (["true", "1", "yes", "active"].includes(normalised)) return true;
    if (["false", "0", "no", "inactive"].includes(normalised)) return false;
  }
  return fallback;
};

const buildOutletPayload = (
  input: Record<string, unknown>,
  includeLocationKey = false,
): OutletDocument => {
  const payload: OutletDocument = {};
  const now = new Date();
  payload.updated_at = now;

  if (includeLocationKey) {
    const locationKey = toStringOrEmpty(input.location_key);
    if (!locationKey) throw new HttpError(400, "location_key is required");
    payload.location_key = locationKey;
    payload.created_at = now;
  }

  const stringFields = ["name", "address", "contact_number", "contact_email", "google_maps_url", "wifi_name", "wifi_password", "welcome_message"];
  for (const field of stringFields) {
    if (field in input) {
      payload[field] = toStringOrEmpty(input[field]);
    }
  }

  // Wi-Fi per floor, matched against each room's Floor when the welcome message is built.
  if ("wifi_floors" in input) {
    const seen = new Set<string>();
    const floors: Array<{ floor: string; wifi_name: string; wifi_password: string }> = [];
    for (const entry of Array.isArray(input.wifi_floors) ? input.wifi_floors.slice(0, 40) : []) {
      const row = (entry ?? {}) as Record<string, unknown>;
      const floor = toStringOrEmpty(row.floor);
      const key = floor.toLowerCase();
      if (!floor || seen.has(key)) continue;
      seen.add(key);
      floors.push({ floor, wifi_name: toStringOrEmpty(row.wifi_name), wifi_password: toStringOrEmpty(row.wifi_password) });
    }
    payload.wifi_floors = floors;
  }

  if ("is_active" in input) {
    payload.is_active = toBoolean(input.is_active, true);
  } else if (includeLocationKey) {
    payload.is_active = true;
  }

  if ("sort_order" in input) {
    const sortOrder = toOptionalNumber(input.sort_order);
    if (sortOrder !== undefined) payload.sort_order = sortOrder;
  } else if (includeLocationKey) {
    payload.sort_order = 0;
  }

  return payload;
};

export class OutletService {
  async listPublic() {
    const db = mongoConnection.getDb();
    const outlets = await db.collection<OutletDocument>("outlets").find({ is_active: true }).toArray();
    return {
      outlets: outlets
        .map((doc) => {
          // Wi-Fi details are for checked-in guests only; they are sent by staff, never published.
          const { wifi_name, wifi_password, wifi_floors, welcome_message, ...publicDoc } = doc;
          return normalizeDocument(publicDoc);
        })
        .map((doc) => ({
          ...doc,
          id: doc?.id ?? stringifyId(doc?._id) ?? "",
        })),
    };
  }

  async manage(request: ManageOutletRequest) {
    const db = mongoConnection.getDb();
    const outletsCollection = db.collection<OutletDocument>("outlets");

    switch (request.action) {
      case "list": {
        const outlets = await outletsCollection.find({}).sort({ sort_order: 1, location_key: 1 }).toArray();
        return { outlets };
      }
      case "create": {
        if (!request.data || typeof request.data !== "object") {
          throw new HttpError(400, "data is required for create action");
        }
        const payload = buildOutletPayload(request.data, true);
        const result = await outletsCollection.insertOne(payload);
        return {
          id: stringifyId(result) ?? result.toString(),
          outlet: { ...payload, _id: result },
        };
      }
      case "update": {
        if (!request.id) {
          throw new HttpError(400, "id is required for update action");
        }
        if (!request.data || typeof request.data !== "object") {
          throw new HttpError(400, "data is required for update action");
        }
        const payload = buildOutletPayload(request.data, false);
        if (Object.keys(payload).length === 1 && "updated_at" in payload) {
          throw new HttpError(400, "No valid fields to update");
        }
        const filter = { _id: resolveOutletId(request.id) };
        const { matchedCount } = await outletsCollection.updateOne(filter, { $set: payload });
        if (!matchedCount) throw new HttpError(404, "Outlet not found");
        return { success: true };
      }
      case "delete": {
        if (!request.id) throw new HttpError(400, "id is required for delete action");
        const filter = { _id: resolveOutletId(request.id) };
        const { deletedCount } = await outletsCollection.deleteOne(filter);
        if (!deletedCount) throw new HttpError(404, "Outlet not found");
        return { success: true };
      }
      default: {
        const exhaustive: never = request.action as never;
        throw new HttpError(400, `Invalid action ${(exhaustive as ManageOutletAction) ?? "unknown"}`);
      }
    }
  }
}

export const outletService = new OutletService();
