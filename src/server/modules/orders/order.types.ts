export type CreateOrderItem = {
  id: string;
  quantity: number;
  price: number;
  notes?: string | null;
};

export type CreateOrderRequest = {
  outletId: string;
  roomTableId?: string;
  bookingId?: string;
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
};

export type GetGuestOrdersResponse = {
  orders: any[];
};

export type GetOrderRequest = {
  orderId: string;
  bookingId?: string;
};

export type AdminManageOrdersRequest = {
  action: "list" | "update_status";
  id?: string;
  status?: string;
};
