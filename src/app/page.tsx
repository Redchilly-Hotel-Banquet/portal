import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { GuestResume } from "@/components/home/guest-resume";
import { Hero } from "@/components/home/hero";
import { Offerings } from "@/components/home/offerings";
import { HowItWorks } from "@/components/home/how-it-works";
import { BanquetFeature } from "@/components/home/banquet-feature";
import { Visit } from "@/components/home/visit";

export const metadata: Metadata = {
  title: { absolute: "Red Chilly | Hotel, Restaurant & Banquet Hall, Gorakhpur" },
  description:
    "Book a room, order from your table by QR code, or plan a banquet at Red Chilly, Gorakhpur.",
};

export default function HomePage() {
  return (
    <SiteShell>
      <GuestResume />
      <Hero />
      <Offerings />
      <HowItWorks />
      <BanquetFeature />
      <Visit />
    </SiteShell>
  );
}
