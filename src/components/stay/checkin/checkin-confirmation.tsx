"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/admin/format";
import { CopyButton } from "../copy-button";
import type { CheckinBooking } from "./types";

export function CheckinConfirmation({ booking, onEdit }: { booking: CheckinBooking; onEdit: () => void }) {
  return (
    <section aria-labelledby="checkin-done" className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-success">
        <CircleCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <p className="eyebrow !text-success">Details received</p>
      </div>
      <h2 id="checkin-done" tabIndex={-1} className="mt-3 text-3xl tracking-tight sm:text-4xl">
        Your check-in details are saved
      </h2>
      <p className="mt-3 text-muted-foreground">
        Thank you, {booking.guest_name}. Please present the original documents at reception. They will verify them
        and complete your check-in.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Booking code</p>
          <p className="mt-1 font-mono text-2xl tracking-widest">{booking.booking_code}</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)}
          </p>
        </div>
        {booking.booking_code && <CopyButton value={booking.booking_code} />}
      </div>

      <ol className="mt-8 space-y-3 text-sm">
        <li className="flex gap-3">
          <span className="tabular-nums text-muted-foreground">1.</span>
          <span>Carry the same photo ID you uploaded for every guest.</span>
        </li>
        <li className="flex gap-3">
          <span className="tabular-nums text-muted-foreground">2.</span>
          <span>Every guest has signed. Reception allots your room and verifies the originals.</span>
        </li>
        <li className="flex gap-3">
          <span className="tabular-nums text-muted-foreground">3.</span>
          <span>Need to change something? Update your details here before you arrive.</span>
        </li>
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onEdit}>
          Edit details
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}
