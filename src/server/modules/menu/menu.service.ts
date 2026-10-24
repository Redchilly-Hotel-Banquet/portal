import type { ObjectId } from "mongodb";
import { mongoConnection } from "../../mongo";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { normalizeDocument } from "../../utils/normalizers";
import { GetMenuRequest, GetMenuResponse, MenuCategory, MenuItem } from "./menu.types";

const normalizeMenuCategory = (doc: any): MenuCategory => {
  const base = normalizeDocument<MenuCategory>(doc) ?? { id: "" };
  if (doc?.outlet_id) {
    base.outlet_id = stringifyId(doc.outlet_id) ?? doc.outlet_id;
  }
  return base;
};

const normalizeMenuItem = (doc: any): MenuItem => {
  const base = normalizeDocument<MenuItem>(doc) ?? { id: "" };
  base.price = base.price ?? (doc?.base_price as number | undefined);
  if (doc?.category_id) {
    base.category_id = stringifyId(doc.category_id) ?? doc.category_id;
  }
  if (doc?.outlet_id) {
    base.outlet_id = stringifyId(doc.outlet_id) ?? doc.outlet_id;
  }
  return base;
};

export class MenuService {
  async getMenu(payload: GetMenuRequest): Promise<GetMenuResponse> {
    const { outletId, categoryId } = payload;
    const db = mongoConnection.getDb();
    const categoriesCollection = db.collection("menu_categories");
    const itemsCollection = db.collection("menu_items");

    const categoryQuery: Record<string, unknown> = { is_active: true };
    if (outletId) {
      categoryQuery.outlet_id = outletId;
    }

    const categories = await categoriesCollection.find(categoryQuery).sort({ sort_order: 1 }).toArray();
    const normalizedCategories = categories
      .map(normalizeMenuCategory)
      .filter((entry) => Boolean(entry.id));

    const itemsQuery: Record<string, unknown> = { is_available: true };
    if (outletId) {
      itemsQuery.outlet_id = outletId;
    }
    if (categoryId) {
      const candidates: Array<string | ObjectId> = [categoryId];
      const asObjectId = toObjectId(categoryId);
      if (asObjectId) candidates.push(asObjectId);
      itemsQuery.category_id = { $in: candidates };
    }

    const items = await itemsCollection.find(itemsQuery).toArray();
    const normalizedItems = items
      .map(normalizeMenuItem)
      .filter((entry) => Boolean(entry.id));

    return {
      categories: normalizedCategories,
      items: normalizedItems,
    };
  }
}

export const menuService = new MenuService();
