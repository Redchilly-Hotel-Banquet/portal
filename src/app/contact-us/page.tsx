import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PageHero } from "@/components/site/page-hero";
import { ContactClient } from "@/components/contact/contact-client";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Phone, email, addresses and opening hours for Red Chilly, Gorakhpur.",
};

export default function ContactPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Contact"
        title="Contact us"
        description="Questions about a stay, a table or an event. We reply during opening hours."
      />
      <ContactClient />
    </SiteShell>
  );
}
