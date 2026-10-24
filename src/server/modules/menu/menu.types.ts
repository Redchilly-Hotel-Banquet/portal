export type GetMenuRequest = {
  outletId?: string;
  categoryId?: string;
};

export type MenuCategory = {
  id: string;
  name?: string;
  description?: string;
  outlet_id?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type MenuItem = {
  id: string;
  name?: string;
  description?: string;
  price?: number;
  is_available?: boolean;
  outlet_id?: string;
  category_id?: string;
  [key: string]: unknown;
};

export type GetMenuResponse = {
  categories: MenuCategory[];
  items: MenuItem[];
};
