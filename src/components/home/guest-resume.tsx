"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getGuestSession } from "@/lib/guestSession";

/** Shows a quiet link to the guest's orders when a stay session exists on this device. */
export function GuestResume() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const sync = () => setHasSession(Boolean(getGuestSession()?.bookingId));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  if (!hasSession) return null;

  return (
    <div className="border-b border-border bg-surface">
      <div className="page-container flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <p className="text-muted-foreground">You have an active stay on this device.</p>
        <Link
          href="/my-orders"
          className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
        >
          View your orders
          <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
