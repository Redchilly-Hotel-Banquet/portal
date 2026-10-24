"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/admin/format";
import { SITE } from "@/components/site/site-config";
import type { CheckinBooking, CheckinDetails } from "./types";

type Props = { booking: CheckinBooking; details: CheckinDetails | null; onUseAnother: () => void };

/** Shown instead of the check-in form once the guest is checked in and a room is assigned. */
export function CheckinLocked({ booking, details, onUseAnother }: Props) {
  const rooms = (details?.assigned_rooms ?? []).map((room) => room.code).filter(Boolean);
  const guests = details?.guests ?? [];
  const assistance = details?.needs_special_assistance
    ? details.special_assistance_details?.trim() || "Yes"
    : "No";

  return (
    <section aria-labelledby="checkin-locked" className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-success">
        <Lock className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <p className="eyebrow !text-success">Checked in</p>
      </div>
      <h2 id="checkin-locked" tabIndex={-1} className="mt-3 text-3xl tracking-tight sm:text-4xl">
        Your check-in is complete
      </h2>
      <p className="mt-3 text-muted-foreground">
        {rooms.length > 0 ? `Room ${rooms.join(", ")} is assigned to you. ` : ""}
        These details are now locked. If anything needs to change, please ask the front desk
        {SITE.phoneDisplay ? ` or call ${SITE.phoneDisplay}` : ""}.
      </p>

      <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-muted-foreground">Booking</dt>
          <dd className="font-mono">{booking.booking_code}</dd>
        </div>
        {booking.check_in_date && booking.check_out_date ? (
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">Stay</dt>
            <dd>
              {formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)}
            </dd>
          </div>
        ) : null}
        {guests.map((guest, index) => (
          <div key={`${guest.full_name}-${index}`} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">Guest {index + 1}</dt>
            <dd className="break-words">
              {guest.full_name}
              <span className="block text-muted-foreground">
                {guest.document_type}
                {guest.document_number_last4 ? `, ending ${guest.document_number_last4}` : ""}
                {guest.has_document_image ? ", ID photo on file" : ""}
                {guest.has_signature ? ", signed" : ""}
              </span>
            </dd>
          </div>
        ))}
        {details?.expected_arrival_time ? (
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">Expected arrival</dt>
            <dd>{details.expected_arrival_time}</dd>
          </div>
        ) : null}
        <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-muted-foreground">Special assistance</dt>
          <dd className="whitespace-pre-wrap break-words">{assistance}</dd>
        </div>
        {details?.other_requests ? (
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">Other requests</dt>
            <dd className="whitespace-pre-wrap break-words">{details.other_requests}</dd>
          </div>
        ) : null}
      </dl>

      <Button type="button" variant="ghost" className="mt-8" onClick={onUseAnother}>
        Look up a different booking
      </Button>
    </section>
  );
}
