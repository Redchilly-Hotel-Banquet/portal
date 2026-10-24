import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PageHero } from "@/components/site/page-hero";
import { BookingFlow } from "@/components/stay/booking/booking-flow";

export const metadata: Metadata = {
  title: "Book a room",
  description: "Reserve a room at Red Chilly, Gorakhpur. Choose your dates and room category and receive a booking code.",
};

export default function BookRoomPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Stay"
        title="Book a room"
        description="Choose a branch and dates, pick your rooms and send your request. The front desk confirms every booking."
      />
      <BookingFlow />
    </SiteShell>
  );
}
