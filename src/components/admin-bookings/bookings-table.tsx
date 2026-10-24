"use client";

import { CalendarX2 } from "lucide-react";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDate } from "@/components/admin/format";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Booking } from "./types";
import { bookingRoomCount, bookingTotal, outletLabel, roomLabel, stayNights } from "./utils";

type Props = {
  bookings: Booking[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (booking: Booking) => void;
};

const HEAD = "sticky top-0 z-10 border-b bg-surface px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

export function BookingsTable({ bookings, loading, selectedId, onSelect }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-md border bg-card p-4" aria-busy="true" aria-label="Loading reservations">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="rounded-md border bg-card">
        <EmptyState icon={CalendarX2} title="No reservations found" description="Adjust the filters or record a new reservation." />
      </div>
    );
  }

  return (
    <div className="max-h-[68vh] overflow-auto rounded-md border bg-card">
      <table className="w-full min-w-[56rem] text-sm">
        <thead>
          <tr>
            <th className={HEAD}>Guest</th>
            <th className={HEAD}>Branch</th>
            <th className={HEAD}>Stay</th>
            <th className={HEAD}>Rooms</th>
            <th className={`${HEAD} text-right`}>Room charges</th>
            <th className={HEAD}>Status</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => {
            const allocated = booking.rooms_allocated ?? [];
            const selected = booking.id === selectedId;
            const nights = stayNights(booking);
            return (
              <tr
                key={booking.id}
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(booking)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(booking);
                  }
                }}
                className={`cursor-pointer border-b last:border-0 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  selected ? "bg-muted/60" : ""
                }`}
              >
                <td className="px-4 py-3 align-top">
                  <div className="font-medium">{booking.guest_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{booking.guest_phone || booking.guest_email || "-"}</div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">{booking.booking_code}</div>
                </td>
                <td className="px-4 py-3 align-top">{outletLabel(booking)}</td>
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <div className="tabular-nums">
                    {formatDate(booking.check_in_date)} to {formatDate(booking.check_out_date)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {nights} night{nights > 1 ? "s" : ""}, {booking.number_of_guests ?? "-"} guest
                    {booking.number_of_guests === 1 ? "" : "s"}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="tabular-nums">{bookingRoomCount(booking)} booked</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {allocated.length
                      ? allocated.map((room, i) => roomLabel(room, i)).join(", ")
                      : booking.preferred_room_type || "Not allocated"}
                  </div>
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <Money value={bookingTotal(booking)} className="font-medium" />
                </td>
                <td className="px-4 py-3 align-top">
                  <StatusBadge status={booking.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
