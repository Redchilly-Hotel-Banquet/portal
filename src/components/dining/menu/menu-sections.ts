import type { MenuCategory, MenuItem } from "../types";
import { normalizeText } from "../utils";

export type DietFilter = "all" | "veg" | "non-veg";

export type MenuSection = {
  id: string;
  name: string;
  items: MenuItem[];
};

const FALLBACK_SECTION = "Other dishes";

const sectionName = (item: MenuItem, categoryById: Map<string, MenuCategory>): string => {
  const fromCategory = item.category_id ? categoryById.get(String(item.category_id))?.name?.trim() : "";
  if (fromCategory) return fromCategory;
  if (typeof item.category === "string" && item.category.trim()) return item.category.trim();
  return FALLBACK_SECTION;
};

/** Groups items under their category (by name, so multi-outlet browsing merges duplicates), in sort order. */
export function buildSections(items: MenuItem[], categories: MenuCategory[]): MenuSection[] {
  const categoryById = new Map(categories.map((c) => [String(c.id), c]));
  const order = new Map<string, number>();
  for (const c of categories) {
    const name = c.name?.trim();
    if (!name) continue;
    const key = normalizeText(name);
    const rank = c.sort_order ?? 9999;
    order.set(key, Math.min(order.get(key) ?? rank, rank));
  }

  const groups = new Map<string, { name: string; items: MenuItem[] }>();
  for (const item of items) {
    const name = sectionName(item, categoryById);
    const key = normalizeText(name);
    const group = groups.get(key) ?? { name, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const fallbackKey = normalizeText(FALLBACK_SECTION);
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === fallbackKey) return 1;
      if (b === fallbackKey) return -1;
      return (order.get(a) ?? 9999) - (order.get(b) ?? 9999) || a.localeCompare(b);
    })
    .map(([, group], index) => ({ id: `section-${index}`, name: group.name, items: group.items }));
}

export function filterItems(items: MenuItem[], query: string, diet: DietFilter): MenuItem[] {
  const q = normalizeText(query.trim());
  return items.filter((item) => {
    if (diet === "veg" && item.is_veg !== true) return false;
    if (diet === "non-veg" && item.is_veg !== false) return false;
    if (!q) return true;
    return normalizeText(item.name ?? "").includes(q) || normalizeText(item.description ?? "").includes(q);
  });
}
