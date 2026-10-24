"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAccount, useGoogleEnabled } from "@/hooks/useAccount";
import { BookingsPanel } from "./bookings-panel";
import { DetailsForm } from "./details-form";
import { SavedDocuments } from "./saved-documents";

function SignedOut() {
  const googleEnabled = useGoogleEnabled();
  return (
    <div className="mx-auto max-w-md rounded-md border border-border bg-card p-8 text-center">
      <h2 className="text-2xl">Sign in to see your profile</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your bookings, saved details and one-tap check-in are tied to your Google account.
      </p>
      {googleEnabled ? (
        <Button asChild className="mt-6">
          <a href="/api/auth/google?next=/profile">Continue with Google</a>
        </Button>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Sign-in is not available right now. Please contact the front desk.</p>
      )}
    </div>
  );
}

export function ProfileView() {
  const account = useAccount();

  if (account === undefined) {
    return (
      <div className="page-container py-10" aria-busy="true">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="page-container py-10 md:py-14">
      {account ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
          <BookingsPanel />
          <aside className="space-y-6">
            <DetailsForm />
            <SavedDocuments />
          </aside>
        </div>
      ) : (
        <SignedOut />
      )}
    </div>
  );
}
