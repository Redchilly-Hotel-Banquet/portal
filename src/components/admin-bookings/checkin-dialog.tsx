"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { formatDateTime } from "@/components/admin/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { optionalPhoneError } from "@/lib/phone";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { GuestEditor } from "./guest-editor";
import { RoomPicker } from "./room-picker";
import type { Booking } from "./types";
import { useCheckinManager } from "./use-checkin";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

function Body({ booking }: { booking: Booking }) {
  const manager = useCheckinManager(booking);
  const { context, loading, error } = manager;

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (loading || !context) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const details = context.checkinDetails;
  const live = context.booking ?? booking;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 text-sm">
        <div>
          <p className="font-medium">{live.guest_name}</p>
          <p className="text-muted-foreground">{live.guest_email || "No email"}</p>
          {live.preferred_categories ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(live.preferred_categories).map(([category, count]) => (
                <Badge key={category} variant="secondary">
                  {category}: {String(count)}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-1 text-right">
          <p className="font-mono text-sm">{live.booking_code}</p>
          <div className="flex items-center justify-end gap-2">
            <StatusBadge status={live.status} />
            {details?.status ? (
              <StatusBadge status={details.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS"} />
            ) : null}
          </div>
        </div>
      </div>

      <Block title="Booking">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="checkin-rooms">Rooms</Label>
            <Input id="checkin-rooms" type="number" min={1} max={50} value={manager.roomsCount} onChange={(e) => manager.setRoomsCount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="checkin-guest-count">Guests</Label>
            <Input id="checkin-guest-count" type="number" min={1} max={50} value={manager.guestCount} onChange={(e) => manager.setGuestCount(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">As booked. Change them if a different number of rooms or guests turned up. Rooms sets how many rooms can be assigned below.</p>
      </Block>

      <Block title="Contact">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone number</Label>
            <PhoneInput id="contact-phone" invalid={Boolean(optionalPhoneError(manager.contactPhone))} value={manager.contactPhone} onChange={(v) => manager.setContactPhone(v)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" value={manager.contactEmail} onChange={(e) => manager.setContactEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
          </div>
        </div>
        {(() => {
          const missing = [
            manager.rules.contact_phone && !manager.hasPhone ? "a phone number" : "",
            manager.rules.contact_email && !manager.hasEmail ? "an email address" : "",
          ].filter(Boolean);
          if (manager.rules.contact_either && !manager.hasPhone && !manager.hasEmail && missing.length === 0) missing.push("a phone number or an email address");
          const required = [manager.rules.contact_phone ? "phone number" : "", manager.rules.contact_email ? "email address" : ""].filter(Boolean);
          if (manager.rules.contact_either && required.length === 0) required.push("phone number or email address");
          const text =
            manager.contactError ??
            (missing.length > 0
              ? `Add ${missing.join(" and ")}. Needed to check in.`
              : required.length > 0
                ? `The ${required.join(" and ")} ${required.length === 1 ? "is" : "are"} needed to check in.`
                : "Both are optional.");
          const bad = Boolean(manager.contactError) || missing.length > 0;
          return (
            <p className={`text-xs ${bad ? "text-destructive" : "text-muted-foreground"}`} role={bad ? "alert" : undefined}>
              {text}
            </p>
          );
        })()}
      </Block>

      <Block title="Guests">
        <GuestEditor
          guests={manager.guests}
          booked={manager.booked}
          onChange={manager.updateGuest}
          onAdd={manager.addGuest}
          onRemove={manager.removeGuest}
          rules={manager.rules}
        />
      </Block>

      <Block title="Stay details">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="arriving-from">Arriving from</Label>
            <Input id="arriving-from" value={manager.arrivingFrom} maxLength={150} onChange={(e) => manager.setArrivingFrom(e.target.value)} placeholder="City or place" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason-for-stay">Reason for stay</Label>
            <Input id="reason-for-stay" value={manager.reasonForStay} maxLength={150} onChange={(e) => manager.setReasonForStay(e.target.value)} placeholder="Business, leisure, family visit" autoComplete="off" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Both are optional and print on the guest register section of the bill and invoice.</p>
      </Block>

      <Block title="Arrival preferences">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Expected arrival</dt>
          <dd>{details?.expected_arrival_time ? formatDateTime(details.expected_arrival_time) : "Not provided"}</dd>
          <dt className="text-muted-foreground">Special assistance</dt>
          <dd>{details?.needs_special_assistance ? details.special_assistance_details || "Requested" : "No"}</dd>
          <dt className="text-muted-foreground">Booking requests</dt>
          <dd>{live.special_requests || "None"}</dd>
          <dt className="text-muted-foreground">Other requests</dt>
          <dd>{details?.other_requests || "None"}</dd>
        </dl>
      </Block>

      <Block title="Assign rooms">
        <RoomPicker rooms={context.availableRooms} selected={manager.selectedRooms} onToggle={manager.toggleRoom} limit={manager.rules.limit_rooms ? manager.roomsBooked : undefined} />
      </Block>

      <div className="flex items-center justify-between gap-4 rounded-md border bg-surface p-4">
        <div>
          <label htmlFor="mark-checked-in" className="text-sm font-medium">
            Mark as checked in
          </label>
          <p className="text-xs text-muted-foreground">Sets the booking to Checked In and unlocks in-room ordering for the allocated rooms.</p>
          {manager.issues.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {manager.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <Switch
          id="mark-checked-in"
          checked={manager.markComplete}
          disabled={manager.issues.length > 0 && !manager.markComplete}
          onCheckedChange={manager.setMarkComplete}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={manager.save} disabled={manager.saving || manager.guests.length === 0}>
          {manager.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          {manager.saving ? "Saving" : "Save check-in"}
        </Button>
      </div>
    </div>
  );
}

type Props = { booking: Booking | null; onClose: () => void; /** Set when check-in was opened straight from a new reservation: goes back to that form. */ onBack?: () => void; backBusy?: boolean };

export function CheckinDialog({ booking, onClose, onBack, backBusy }: Props) {
  return (
    <Dialog open={booking !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check-in</DialogTitle>
          <DialogDescription>Capture guest details and signatures, allocate rooms and complete arrival.</DialogDescription>
        </DialogHeader>
        {booking ? <>
            {onBack ? (
              <Button type="button" variant="ghost" size="sm" className="-mt-2 w-fit self-start" onClick={onBack} disabled={backBusy}>
                {backBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />}Back to reservation
              </Button>
            ) : null}
            <Body key={booking.id} booking={booking} />
          </> : null}
      </DialogContent>
    </Dialog>
  );
}
