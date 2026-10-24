import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PageHero } from "@/components/site/page-hero";
import { BanquetForm } from "@/components/banquet/banquet-form";

export const metadata: Metadata = {
  title: "Banquet enquiry",
  description: "Enquire about hosting a wedding, reception or corporate event at Red Chilly banquet hall, Gorakhpur.",
};

export default function BanquetPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Banquet"
        title="Banquet hall enquiry"
        description="Tell us about your event. We will reply with availability and packages."
      />
      <BanquetForm />
    </SiteShell>
  );
}
