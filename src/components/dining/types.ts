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
  description?: string | null;
  image_url?: string | null;
  price?: number | string;
  prep_time_minutes?: number | string | null;
  is_available?: boolean | null;
  is_veg?: boolean | null;
  outlet_id?: string;
  category_id?: string;
  /** Legacy records may carry the category name directly. */
  category?: string | null;
};

export type MenuResponse = { categories: MenuCategory[]; items: MenuItem[] };

export type OutletInfo = { id: string; name?: string | null; location_key?: string | null };

export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  prepTime: number;
  notes?: string;
};

export type OrderStatusKey = "PENDING" | "ACCEPTED" | "PREPARING" | "READY" | "DELIVERED" | "ORDER_FINISHED";

export type OrderItemRecord = {
  id?: string;
  quantity: number;
  price: number | string;
  notes?: string | null;
  menu_items?: { name?: string } | null;
};

export type OrderRecord = {
  id: string;
  status: string;
  created_at?: string;
  total: number | string;
  special_instructions?: string | null;
  rooms_tables?: { type?: string; code?: string } | null;
  order_items?: OrderItemRecord[];
};
