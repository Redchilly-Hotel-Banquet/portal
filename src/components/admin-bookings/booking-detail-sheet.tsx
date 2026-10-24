"use client";

import { useState } from "react";
import { DoorOpen, LogOut, Receipt } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { formatDate, formatINR } from "@/components/admin/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingCharges } from "./booking-charges";
import { BookingTimeline } from "./booking-timeline";
import { BOOKING_STATUSES, type BillingSummary, type Booking } from "./types";
import { useBillingQuery, useCheckout, useUpdateStatus } from "./use-bookings";
import { errorMessage, outletLabel, roomLabel, roomNightlyRate, stayNights } from "./utils";

type Props = {
  booking: Booking | null;
  onClose: () => void;
  onManageCheckin: (booking: Booking) => void;
  onOpenInvoice: (summary: BillingSummary) => void;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t px-6 py-5">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function BookingDetailSheet({ booking, onClose, onManageCheckin, onOpenInvoice }: Props) {
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const billingQuery = useBillingQuery(booking?.id ?? null);
  const statusMutation = useUpdateStatus();
  const checkout = useCheckout();

  const runCheckout = async () => {
    if (!booking) return;
    try {
      await checkout.mutateAsync(booking.id);
    } finally {
      setConfirmCheckout(false);
    }
  };

  return (
    <>
      <Sheet open={booking !== null} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          {booking ? (
            <>
              <SheetHeader className="space-y-1 px-6 pb-5 pt-6 text-left">
                <p className="eyebrow">{booking.booking_code}</p>
                <SheetTitle className="pr-8">{booking.guest_name}</SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={booking.status} />
                  <span>{outletLabel(booking)}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-wrap items-center gap-2 border-t bg-surface px-6 py-4">
                <Select value={booking.status} onValueChange={(status) => statusMutation.mutate({ id: booking.id, status })}>
                  <SelectTrigger className="w-[10.5rem]" aria-label="Change status" disabled={statusMutation.isPending}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUSES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => onManageCheckin(booking)}>
                  <DoorOpen className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Check-in
                </Button>
                <Button variant="outline" onClick={() => billingQuery.data && onOpenInvoice(billingQuery.data)} disabled={!billingQuery.data}>
                  <Receipt className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Invoice
                </Button>
                {booking.status === "CHECKED_IN" ? (
                  <Button onClick={() => setConfirmCheckout(true)}>
                    <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Check out
                  </Button>
                ) : null}
              </div>

              <Section title="Guest">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Phone">{booking.guest_phone || "No phone"}</Detail>
                  <Detail label="Email">{booking.guest_email || "No email"}</Detail>
                  <Detail label="Guests">{booking.number_of_guests ?? "-"}</Detail>
                  <Detail label="Special requests">{booking.special_requests || "None"}</Detail>
                </dl>
              </Section>

              <Section title="Stay">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Check-in">{formatDate(booking.check_in_date)}</Detail>
                  <Detail label="Check-out">{formatDate(booking.check_out_date)}</Detail>
                  <Detail label="Nights">{stayNights(booking)}</Detail>
                  <Detail label="Rooms requested">{booking.rooms_requested ?? (booking.room_ids?.length || 1)}</Detail>
                </dl>
                {booking.preferred_room_type ? (
                  <p className="text-sm text-muted-foreground">Preferred type: {booking.preferred_room_type}</p>
                ) : null}
                {(booking.rooms_allocated ?? []).length ? (
                  <ul className="divide-y rounded-md border bg-card text-sm">
                    {(booking.rooms_allocated ?? []).map((room, index) => {
                      const rate = roomNightlyRate(room);
                      const nights = room.perNight?.length ?? booking.nights ?? 1;
                      return (
                        <li key={room.room_id ?? room.id ?? index} className="flex items-center justify-between gap-3 p-3">
                          <span className="font-medium">
                            {roomLabel(room, index)}
                            {!room.code ? <span className="ml-2 text-xs font-normal text-muted-foreground">Not yet assigned</span> : null}
                          </span>
                          {rate > 0 ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatINR(rate)} x {nights} night{nights > 1 ? "s" : ""}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {booking.rooms_tables?.code ?? "Rooms are allocated at check-in."}
                  </p>
                )}
              </Section>

              <Section title="Timeline">
                <BookingTimeline booking={booking} />
              </Section>

              <Section title="Charges">
                <BookingCharges
                  booking={booking}
                  billing={billingQuery.data}
                  loading={billingQuery.isLoading}
                  error={billingQuery.error ? errorMessage(billingQuery.error, "Unable to fetch billing details.") : null}
                />
              </Section>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmCheckout}
        onOpenChange={setConfirmCheckout}
        title="Complete checkout?"
        description="The booking is marked Checked out and the folio total is finalised with in-room orders to date."
        confirmLabel="Check out"
        loading={checkout.isPending}
        onConfirm={runCheckout}
      />
    </>
  );
}
