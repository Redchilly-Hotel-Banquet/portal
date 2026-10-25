export const ORDER_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that still need kitchen attention. */
export const ACTIVE_STATUSES: OrderStatus[] = ["PENDING", "ACCEPTED", "PREPARING", "READY"];

/** Next step in the kitchen flow, with the label of the button that performs it. */
export const NEXT_STEP: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  PENDING: { status: "ACCEPTED", label: "Accept" },
  ACCEPTED: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "READY", label: "Mark ready" },
  READY: { status: "DELIVERED", label: "Mark delivered" },
};

export type OrderMenuItem = {
  name?: string;
  category?: string;
};

export type OrderLine = {
  quantity: number;
  price: number | string;
  notes?: string | null;
  menu_items?: OrderMenuItem | null;
};

export type OrderLocation = {
  _id?: string;
  type?: string;
  code?: string;
};

export type AdminOrder = {
  _id: string;
  outlet_id: string;
  room_table_id?: string | null;
  status: string;
  total: number | string;
  special_instructions?: string | null;
  /** "PHONE" when staff entered it for a guest who ordered by phone. */
  source?: string | null;
  created_at: string;
  rooms_tables?: OrderLocation | null;
  order_items?: OrderLine[];
};

export type SortKey = "NEWEST" | "OLDEST" | "REPEAT_FIRST";

export const POLL_MS = 10_000;
export const ALARM_SRC = "/alarm.wav";
export const PAGE_SIZE = 10;

export const shortId = (id: string) => id.substring(0, 8).toUpperCase();

export const locationLabel = (order: AdminOrder) =>
  order.rooms_tables
    ? `${(order.rooms_tables.type ?? "").replace(/_/g, " ").toLowerCase()} ${order.rooms_tables.code ?? ""}`.trim()
    : "No location";

export const locationKey = (order: AdminOrder) =>
  order.room_table_id ?? order.rooms_tables?._id ?? "unknown";
