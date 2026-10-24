import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteShell } from "@/components/site/site-shell";
import { QrView } from "@/components/dining/qr/qr-view";

export const metadata: Metadata = {
  title: "Scan QR code",
  description: "Scan the QR code in your room or on your table to order from the Red Chilly menu.",
};

export default function QrPage() {
  return (
    <SiteShell>
      <Suspense fallback={<div className="page-container py-24" aria-busy="true" />}>
        <QrView />
      </Suspense>
    </SiteShell>
  );
}
