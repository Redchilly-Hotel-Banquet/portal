import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { CheckoutView } from "@/components/dining/checkout/checkout-view";

export const metadata: Metadata = { title: "Review order", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <SiteShell>
      <CheckoutView />
    </SiteShell>
  );
}
