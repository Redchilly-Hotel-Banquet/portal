import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { OrderStatusView } from "@/components/dining/orders/order-status-view";

export const metadata: Metadata = { title: "Order status", robots: { index: false, follow: false } };

export default function OrderStatusPage() {
  return (
    <SiteShell>
      <OrderStatusView />
    </SiteShell>
  );
}
