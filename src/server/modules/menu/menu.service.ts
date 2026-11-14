import { outletDirectory, outletKeyOf } from "../../utils/outlets";
import { categoryNames } from "../../utils/menuRefs";
import { mongoConnection } from "../../mongo";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { normalizeDocument } from "../../utils/normalizers";
import { GetMenuRequest, GetMenuResponse, MenuCategory, MenuItem } from "./menu.types";

const normalizeMenuCategory = (doc: any): MenuCategory => {
  const base = normalizeDocument<MenuCategory>(doc) ?? { id: "" };
  if (doc?.outlet_id) {
    base.outlet_id = outletKeyOf(doc.outlet_id) ?? doc.outlet_id;
  }
  return base;
};

const normalizeMenuItem = (doc: any, names: Map<string, string>): MenuItem => {
  const base = normalizeDocument<MenuItem>(doc) ?? { id: "" };
  base.price = base.price ?? (doc?.base_price as number | undefined);
  if (doc?.category_id) {
    base.category_id = stringifyId(doc.category_id) ?? doc.category_id;
  }
  if (doc?.outlet_id) {
    base.outlet_id = outletKeyOf(doc.outlet_id) ?? doc.outlet_id;
  }
  // The category's name is looked up from its id; it is not stored on the item.
  (base as any).category = names.get(String(doc?.category_id ?? "")) ?? "";
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
      categoryQuery.outlet_id = outletDirectory.idOf(outletId) ?? "no-such-branch";
    }

    const categories = await categoriesCollection.find(categoryQuery).sort({ sort_order: 1 }).toArray();
    const normalizedCategories = categories
      .map(normalizeMenuCategory)
      .filter((entry) => Boolean(entry.id));

    const itemsQuery: Record<string, unknown> = { is_available: true };
    if (outletId) {
      itemsQuery.outlet_id = outletDirectory.idOf(outletId) ?? "no-such-branch";
    }
    if (categoryId) {
      itemsQuery.category_id = toObjectId(categoryId) ?? "no-such-category";
    }

    const items = await itemsCollection.find(itemsQuery).toArray();
    const names = await categoryNames(db);
    const normalizedItems = items
      .map((doc) => normalizeMenuItem(doc, names))
      .filter((entry) => Boolean(entry.id));

    return {
      categories: normalizedCategories,
      items: normalizedItems,
    };
  }
}

export const menuService = new MenuService();
