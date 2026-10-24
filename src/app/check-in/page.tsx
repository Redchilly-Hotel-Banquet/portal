import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteShell } from "@/components/site/site-shell";
import { PageHero } from "@/components/site/page-hero";
import { CheckinFlow } from "@/components/stay/checkin/checkin-flow";

export const metadata: Metadata = {
  title: "Online check-in",
  description: "Complete guest details and identity documents before you arrive at Red Chilly, Gorakhpur.",
};

export default function CheckInPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Stay"
        title="Online check-in"
        description="Share guest details and identity documents ahead of arrival. Reception completes your check-in on the day."
      />
      <Suspense>
        <CheckinFlow />
      </Suspense>
    </SiteShell>
  );
}
