export type MenuItemRecord = {
  _id?: string;
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  base_price?: number;
  category?: string;
  category_id?: string;
  outlet_id?: string;
  prep_time_minutes?: number;
  is_veg?: boolean;
  is_available?: boolean;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
};

export type MenuItemListResponse = {
  items: MenuItemRecord[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

/** Body sent to /admin/menu-items/manage for create and update. The backend field is base_price. */
export type MenuItemPayload = {
  name: string;
  description: string;
  base_price: number;
  category_id: string;
  category: string;
  outlet_id: string;
  prep_time_minutes: number;
  is_veg: boolean;
  is_available: boolean;
  image_url: string;
};

export type CategoryRecord = {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  outlet_id?: string;
  sort_order?: number;
  is_active?: boolean;
};

export type CategoryPayload = {
  name: string;
  description: string;
  outlet_id: string;
  sort_order: number;
  is_active: boolean;
};

export const itemId = (item: MenuItemRecord) => item._id ?? item.id ?? "";

export const categoryId = (c: CategoryRecord) => c.id ?? c._id ?? "";
