import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PageHero } from "@/components/site/page-hero";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = {
  title: "My profile",
  description: "Your bookings, saved details and online check-in at Red Chilly, Gorakhpur.",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return (
    <SiteShell>
      <PageHero eyebrow="Account" title="My profile" description="Your stays, saved details and online check-in in one place." />
      <ProfileView />
    </SiteShell>
  );
}
