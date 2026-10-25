export type CreateOrderItem = {
  id: string;
  quantity: number;
  price: number;
  notes?: string | null;
};

export type CreateOrderRequest = {
  outletId: string;
  roomTableId?: string;
  /** Proof of the stay for room orders: the 6-digit check-in ID. */
  checkinId?: string;
  specialInstructions?: string;
  items: CreateOrderItem[];
  subtotal: number;
};

export type CreateOrderResponse = {
  orderId: string;
  bookingId?: string | null;
};

export type GetGuestOrdersRequest = {
  bookingId: string;
  checkinId?: string;
};

export type GetGuestOrdersResponse = {
  orders: any[];
};

export type GetOrderRequest = {
  orderId: string;
  bookingId?: string;
  checkinId?: string;
};

export type AdminManageOrdersRequest = {
  action: "list" | "update_status";
  id?: string;
  status?: string;
};
