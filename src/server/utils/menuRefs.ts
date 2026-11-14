import type { Db } from "mongodb";
import { outletKeyOf } from "./outlets";

/**
 * Menu items point at their category by _id. Screens still show the category's name, so it is looked up here
 * (a small list, kept for 30 seconds and cleared whenever a category is written).
 */
let cache: { at: number; names: Map<string, string> } | null = null;

export const invalidateCategoryNames = () => {
  cache = null;
};

export const categoryNames = async (db: Db): Promise<Map<string, string>> => {
  if (cache && Date.now() - cache.at < 30_000) return cache.names;
  const docs = await db.collection("menu_categories").find({}, { projection: { name: 1 } }).toArray();
  cache = { at: Date.now(), names: new Map(docs.map((doc) => [String(doc._id), String(doc.name ?? "")])) };
  return cache.names;
};

/** A menu item as the screens expect it: its category by name and its branch by key, alongside the stored ids. */
export const presentMenuItem = <T extends Record<string, any>>(doc: T, names: Map<string, string>): T & { category: string } => ({
  ...doc,
  category: names.get(String(doc.category_id ?? "")) ?? "",
  ...(doc.outlet_id !== undefined ? { outlet_id: outletKeyOf(doc.outlet_id) } : {}),
});

/** Any stored document with a branch reference, with the branch shown as its key. */
export const withOutletKey = <T extends Record<string, any>>(doc: T): T => (doc && doc.outlet_id !== undefined ? { ...doc, outlet_id: outletKeyOf(doc.outlet_id) } : doc);
