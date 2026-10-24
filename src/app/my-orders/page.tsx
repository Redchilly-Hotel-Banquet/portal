import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { MyOrdersView } from "@/components/dining/orders/my-orders-view";

export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };

export default function MyOrdersPage() {
  return (
    <SiteShell>
      <MyOrdersView />
    </SiteShell>
  );
}
