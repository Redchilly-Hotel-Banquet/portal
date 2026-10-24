"use client";

import Link from "next/link";
import { ArrowRight, BedDouble, CalendarDays, CheckCircle2, ClipboardCheck, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/admin/status-badge";
import { formatDate, formatINR } from "@/components/admin/format";
import { InvoiceButton } from "./invoice-button";
import { useMyBookings, type MyBooking } from "./queries";

function BookingCard({ booking, upcoming }: { booking: MyBooking; upcoming: boolean }) {
  const range =
    booking.checkInDate && booking.checkOutDate
      ? `${formatDate(booking.checkInDate)} to ${formatDate(booking.checkOutDate)}`
      : "Dates to be confirmed";
  const facts = [
    booking.outlet,
    booking.nights > 0 ? `${booking.nights} night${booking.nights === 1 ? "" : "s"}` : null,
    booking.guests > 0 ? `${booking.guests} guest${booking.guests === 1 ? "" : "s"}` : null,
    booking.rooms > 0 ? `${booking.rooms} room${booking.rooms === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <li className="rounded-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm tracking-wider text-muted-foreground">{booking.bookingCode}</p>
          <p className="mt-1 flex items-center gap-2 font-display text-lg">
            <CalendarDays className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
            {range}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{facts.join("  ·  ")}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={booking.status} />
          {booking.totalAmount > 0 ? <p className="text-sm tabular-nums">{formatINR(booking.totalAmount)}</p> : null}
        </div>
      </div>

      {upcoming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {booking.checkinLocked ? (
            <p className="inline-flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={1.75} aria-hidden />
              <span>
                Checked in{booking.roomCodes.length ? ` to room ${booking.roomCodes.join(", ")}` : ""}. Your check-in details are
                locked; the front desk can change them if needed. Your invoice will be here after check-out.
              </span>
            </p>
          ) : booking.canCheckin ? (
            <>
              <Button asChild size="sm">
                <Link href={`/check-in?code=${encodeURIComponent(booking.bookingCode)}`}>
                  <ClipboardCheck className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {booking.checkinSubmitted ? "Review check-in details" : "Start check-in"}
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Link>
              </Button>
              {booking.checkinSubmitted ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Details submitted
                </span>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Online check-in opens once the front desk confirms this booking.
            </p>
          )}
        </div>
      ) : booking.status === "CHECKED_OUT" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <InvoiceButton bookingId={booking.id} />
          <span className="text-sm text-muted-foreground">Charges, food orders and guest verification for this stay.</span>
        </div>
      ) : null}
    </li>
  );
}

function List({ items, upcoming, empty }: { items: MyBooking[]; upcoming: boolean; empty: React.ReactNode }) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="space-y-3">
      {items.map((booking) => (
        <BookingCard key={booking.id} booking={booking} upcoming={upcoming} />
      ))}
    </ul>
  );
}

const Empty = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-md border border-dashed border-border p-8 text-center">
    <BedDouble className="mx-auto h-6 w-6 text-muted-foreground" strokeWidth={1.75} aria-hidden />
    <p className="mt-3 font-display text-lg">{title}</p>
    <div className="mt-1 text-sm text-muted-foreground">{children}</div>
  </div>
);

export function BookingsPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useMyBookings(true);

  return (
    <section aria-labelledby="bookings-title">
      <p className="eyebrow">Your stays</p>
      <h2 id="bookings-title" className="mt-2 text-2xl">
        Bookings
      </h2>

      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError || !data ? (
          <div role="alert" className="rounded-md border border-destructive/40 p-5 text-sm">
            We could not load your bookings.{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
              {isFetching ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-label="Retrying" /> : "Try again"}
            </button>
          </div>
        ) : (
          <Tabs defaultValue="upcoming">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming ({data.upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({data.past.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming" className="mt-4">
              <List
                items={data.upcoming}
                upcoming
                empty={
                  <Empty title="No upcoming stays">
                    <Link href="/book-room" className="text-primary underline-offset-4 hover:underline">
                      Book a room
                    </Link>{" "}
                    to see it here.
                  </Empty>
                }
              />
            </TabsContent>
            <TabsContent value="past" className="mt-4">
              <List
                items={data.past}
                upcoming={false}
                empty={<Empty title="No past stays yet">Completed and cancelled bookings appear here.</Empty>}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Bookings made while signed in, or with your account email, appear here automatically.
      </p>
    </section>
  );
}
