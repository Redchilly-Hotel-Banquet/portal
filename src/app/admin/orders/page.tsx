import type { Metadata } from "next";
import { OrdersConsole } from "@/components/admin-orders/orders-console";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <OrdersConsole />;
}
