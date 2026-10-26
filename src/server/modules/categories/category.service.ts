import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { normalizeDocument } from "../../utils/normalizers";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { ManageCategoryRequest } from "./category.types";
import type { AuthenticatedUser } from "../../session";
import { assertOutlet, outletFilter } from "../../utils/access";

type FlexibleId = string | import("mongodb").ObjectId;

type CategoryDocument = {
  _id?: FlexibleId;
} & Record<string, unknown>;

const resolveCategoryId = (value: unknown): FlexibleId => {
  const objectId = toObjectId(value);
  if (objectId) return objectId;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  throw new HttpError(400, "Invalid category id");
};

export class CategoryService {
  async manage(request: ManageCategoryRequest, user: AuthenticatedUser) {
    const db = mongoConnection.getDb();
    const collection = db.collection<CategoryDocument>("menu_categories");

    switch (request.action) {
      case "list": {
        const categories = await collection.find(outletFilter(user)).sort({ sort_order: 1 }).toArray();
        return categories.map((item) => {
          const normalized = normalizeDocument(item);
          return { ...normalized, id: normalized?.id ?? stringifyId(item?._id) ?? "" };
        });
      }
      case "create": {
        if (!request.data || typeof request.data !== "object") {
          throw new HttpError(400, "data is required for create action");
        }
        assertOutlet(user, request.data.outlet_id);
        const payload = {
          ...request.data,
          created_at: new Date(),
          is_active: request.data.is_active ?? true,
          sort_order: request.data.sort_order ?? 0,
        };
        const result = await collection.insertOne(payload);
        return {
          id: stringifyId(result.insertedId) ?? result.insertedId.toString(),
          ...payload,
        };
      }
      case "update": {
        if (!request.id) throw new HttpError(400, "id is required for update action");
        if (!request.data || typeof request.data !== "object") {
          throw new HttpError(400, "data is required for update action");
        }
        const existing = await collection.findOne({ _id: resolveCategoryId(request.id) });
        if (!existing) throw new HttpError(404, "Category not found");
        assertOutlet(user, existing.outlet_id);
        if (request.data.outlet_id !== undefined) assertOutlet(user, request.data.outlet_id);
        await collection.updateOne(
          { _id: resolveCategoryId(request.id) },
          { $set: request.data }
        );
        return { success: true };
      }
      case "delete": {
        if (!request.id) throw new HttpError(400, "id is required for delete action");
        const doomed = await collection.findOne({ _id: resolveCategoryId(request.id) });
        if (doomed) assertOutlet(user, doomed.outlet_id);
        await collection.deleteOne({ _id: resolveCategoryId(request.id) });
        return { success: true };
      }
      default:
        throw new HttpError(400, "Invalid action");
    }
  }
}

export const categoryService = new CategoryService();
