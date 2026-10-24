"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAdminOutlets, hasOutletAccess } from "@/hooks/useAdminAccess";
import type { CreateBookingForm, OutletOption } from "./types";
import { useCreateBooking } from "./use-bookings";

const EMPTY_FORM: CreateBookingForm = {
  outlet_id: "",
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  check_in_date: "",
  check_out_date: "",
  guests: "1",
  rooms_requested: "1",
  preferred_room_type: "",
  special_requests: "",
  total_amount: "",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outlets: OutletOption[];
  defaultOutlet: string;
};

function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function CreateBookingDialog({ open, onOpenChange, outlets, defaultOutlet }: Props) {
  const [form, setForm] = useState<CreateBookingForm>(EMPTY_FORM);
  const mutation = useCreateBooking(() => {
    setForm(EMPTY_FORM);
    onOpenChange(false);
  });

  const allowedOutlets = useMemo(() => {
    if (!open) return outlets;
    const allowed = getAdminOutlets();
    return outlets.filter((outlet) => hasOutletAccess(allowed, outlet.location_key));
  }, [open, outlets]);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => {
      if (prev.outlet_id) return prev;
      const fallback = defaultOutlet !== "all" ? defaultOutlet : allowedOutlets[0]?.location_key;
      return fallback ? { ...prev, outlet_id: fallback } : prev;
    });
  }, [open, defaultOutlet, allowedOutlets]);

  const set = (field: keyof CreateBookingForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const fail = (message: string) => toast.error(message);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const guestName = form.guest_name.trim();
    const guestPhone = form.guest_phone.trim();
    const roomType = form.preferred_room_type.trim();

    if (!form.outlet_id || !guestName || !guestPhone || !form.check_in_date || !form.check_out_date) {
      return fail("Branch, guest details and stay dates are required.");
    }
    if (!roomType) return fail("Enter the preferred room type.");

    const checkIn = new Date(form.check_in_date);
    const checkOut = new Date(form.check_out_date);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      return fail("Provide valid check-in and check-out dates.");
    }
    if (checkOut <= checkIn) return fail("Check-out must be after the check-in date.");

    const guests = Number.parseInt(form.guests, 10) || 1;
    const rooms = Number.parseInt(form.rooms_requested, 10) || 1;
    if (rooms <= 0) return fail("Rooms requested must be at least one.");

    let total: number | undefined;
    const trimmed = form.total_amount.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) return fail("Enter a valid negotiated total or leave it blank.");
      total = Number(parsed.toFixed(2));
    }

    const payload: Record<string, unknown> = {
      outlet_id: form.outlet_id,
      rooms_requested: rooms,
      preferred_room_type: roomType,
      guest_name: guestName,
      guest_email: form.guest_email.trim() || null,
      guest_phone: guestPhone,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      number_of_guests: guests,
      special_requests: form.special_requests.trim() || null,
    };
    if (total !== undefined) payload.total_amount = total;
    mutation.mutate(payload);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) setForm(EMPTY_FORM);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New reservation</DialogTitle>
          <DialogDescription>Record a booking on behalf of a guest. It starts as Pending.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="create-outlet" label="Branch *">
              <Select value={form.outlet_id} onValueChange={(v) => set("outlet_id", v)}>
                <SelectTrigger id="create-outlet">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {allowedOutlets.map((outlet) => (
                    <SelectItem key={outlet.location_key} value={outlet.location_key}>
                      {outlet.name ?? outlet.location_key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="create-rooms" label="Rooms *">
              <Input id="create-rooms" type="number" min={1} value={form.rooms_requested} onChange={(e) => set("rooms_requested", e.target.value)} required />
            </Field>
            <Field id="create-guest-name" label="Guest name *">
              <Input id="create-guest-name" autoComplete="off" value={form.guest_name} onChange={(e) => set("guest_name", e.target.value)} required />
            </Field>
            <Field id="create-phone" label="Phone *">
              <Input id="create-phone" type="tel" inputMode="tel" autoComplete="off" value={form.guest_phone} onChange={(e) => set("guest_phone", e.target.value)} required />
            </Field>
            <Field id="create-email" label="Email">
              <Input id="create-email" type="email" autoComplete="off" value={form.guest_email} onChange={(e) => set("guest_email", e.target.value)} />
            </Field>
            <Field id="create-guests" label="Guests *">
              <Input id="create-guests" type="number" min={1} value={form.guests} onChange={(e) => set("guests", e.target.value)} required />
            </Field>
            <Field id="create-checkin" label="Check-in *">
              <Input id="create-checkin" type="date" value={form.check_in_date} onChange={(e) => set("check_in_date", e.target.value)} required />
            </Field>
            <Field id="create-checkout" label="Check-out *">
              <Input id="create-checkout" type="date" min={form.check_in_date || undefined} value={form.check_out_date} onChange={(e) => set("check_out_date", e.target.value)} required />
            </Field>
            <Field id="create-room-type" label="Preferred room type *" className="sm:col-span-2">
              <Input id="create-room-type" value={form.preferred_room_type} onChange={(e) => set("preferred_room_type", e.target.value)} placeholder="e.g. Deluxe, Suite" required />
            </Field>
            <Field id="create-total" label="Negotiated total (INR)" hint="Leave blank to use standard nightly totals." className="sm:col-span-2">
              <Input id="create-total" type="number" inputMode="decimal" min={0} step="0.01" value={form.total_amount} onChange={(e) => set("total_amount", e.target.value)} placeholder="Agreed total for the whole stay" />
            </Field>
            <Field id="create-notes" label="Special requests" className="sm:col-span-2">
              <Textarea id="create-notes" rows={3} value={form.special_requests} onChange={(e) => set("special_requests", e.target.value)} />
            </Field>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              {mutation.isPending ? "Saving" : "Create reservation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
