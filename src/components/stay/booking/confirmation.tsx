"use client";

import Link from "next/link";
import { CircleCheck, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatINR } from "@/components/admin/format";
import { CopyButton } from "../copy-button";
import type { BookingRecord } from "./types";

export interface ConfirmationData {
  booking: BookingRecord;
  rooms: Array<{ category: string; count: number }>;
  nights: number;
  total: number;
  outlet: string;
}

export function BookingConfirmation({ data }: { data: ConfirmationData }) {
  const { booking, rooms, nights, total, outlet } = data;
  const guests = booking.number_of_guests;

  return (
    <section aria-labelledby="confirmation-title" className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-success">
        <CircleCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        <p className="eyebrow !text-success">Request received</p>
      </div>
      <h2 id="confirmation-title" tabIndex={-1} className="mt-3 text-3xl tracking-tight sm:text-4xl">
        Your booking code
      </h2>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-border bg-card p-5">
        <p className="font-mono text-3xl tracking-widest" data-testid="booking-code">
          {booking.booking_code}
        </p>
        <CopyButton value={booking.booking_code} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Keep this code. You will need it, with the guest&apos;s last name, for online check-in.
      </p>

      <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
        {[
          ["Branch", outlet],
          ["Arrival", formatDate(booking.check_in_date)],
          ["Departure", formatDate(booking.check_out_date)],
          ["Nights", String(nights)],
          ["Guest", `${booking.guest_name ?? "-"}${guests ? `, ${guests} ${guests === 1 ? "guest" : "guests"}` : ""}`],
          ["Rooms", rooms.map((r) => `${r.count} x ${r.category}`).join(", ") || "-"],
          ["Estimated total", formatINR(booking.total_amount ?? total)],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8">
        <p className="eyebrow">Next steps</p>
        <ol className="mt-3 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="tabular-nums text-muted-foreground">1.</span>
            <span>The front desk reviews your request and confirms it. Your status is pending until then.</span>
          </li>
          <li className="flex gap-3">
            <span className="tabular-nums text-muted-foreground">2.</span>
            <span>Once confirmed, complete self check-in online with your booking code to save time on arrival.</span>
          </li>
          <li className="flex gap-3">
            <span className="tabular-nums text-muted-foreground">3.</span>
            <span>Carry a valid photo ID for every guest. Room numbers are allotted at the desk.</span>
          </li>
        </ol>
      </div>

      <div className="mt-8 flex flex-wrap gap-3 print:hidden">
        <Button asChild>
          <Link href="/check-in">Go to check-in</Link>
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Print
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </section>
  );
}
