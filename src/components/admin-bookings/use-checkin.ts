"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";
import { optionalPhoneError } from "@/lib/phone";
import type { Booking, CheckinContext } from "./types";
import {
  blankGuest,
  bookedGuestCount,
  buildGuestPayload,
  completionIssues,
  hasDetails,
  MAX_ADMIN_GUESTS,
  MAX_PAYLOAD_CHARS,
  payloadSize,
  seedGuests,
  type AdminGuest,
} from "./checkin-guests";
import { assignedRoomIds, errorMessage, isCheckinComplete } from "./utils";
import { BOOKINGS_KEY } from "./use-bookings";

export function useCheckinManager(booking: Booking | null) {
  const queryClient = useQueryClient();
  const bookingId = booking?.id ?? null;
  const [context, setContext] = useState<CheckinContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [markComplete, setMarkComplete] = useState(false);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const hydrate = useCallback((payload: CheckinContext, fallbackStatus?: string) => {
    setContext(payload);
    setGuests(seedGuests(payload));
    setContactPhone(payload.booking?.guest_phone ?? "");
    setContactEmail(payload.booking?.guest_email ?? "");
    setSelectedRooms(assignedRoomIds(payload));
    setMarkComplete(isCheckinComplete(payload, fallbackStatus));
  }, []);

  useEffect(() => {
    if (!bookingId) {
      setContext(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContext(null);
    apiPost<CheckinContext>("/admin/bookings/checkin", { action: "admin-fetch", bookingId }, true)
      .then((payload) => {
        if (cancelled) return;
        if (!payload) throw new Error("No check-in data returned.");
        hydrate(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = errorMessage(err, "Unable to fetch check-in details.");
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, hydrate]);

  const toggleRoom = useCallback((roomId: string, checked: boolean) => {
    setSelectedRooms((prev) => {
      const next = new Set(prev);
      if (checked) next.add(roomId);
      else next.delete(roomId);
      return Array.from(next);
    });
  }, []);

  const booked = context ? bookedGuestCount(context) : booking?.number_of_guests || 1;
  // Someone has to be reachable: the booking contact below, or any guest's own number.
  const hasContact = Boolean(contactPhone.trim() || contactEmail.trim() || guests.some((guest) => guest.phone.trim()));
  const contactError = optionalPhoneError(contactPhone) || (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) ? "Enter a valid email address, or leave it blank." : null);
  const issues = useMemo(() => completionIssues(guests, booked, selectedRooms.length, hasContact), [guests, booked, selectedRooms, hasContact]);

  const updateGuest = useCallback((key: string, patch: Partial<AdminGuest>) => {
    setGuests((prev) => prev.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)));
  }, []);

  const addGuest = useCallback(() => {
    setGuests((prev) => (prev.length >= MAX_ADMIN_GUESTS ? prev : [...prev, blankGuest()]));
  }, []);

  const removeGuest = useCallback(
    (key: string) => {
      // At least one guest always stays.
      setGuests((prev) => (prev.length > 1 ? prev.filter((guest) => guest.key !== key) : prev));
    },
    [],
  );

  const save = useCallback(async () => {
    if (!booking || !context) return;
    const details = context.checkinDetails;
    if (!guests.every(hasDetails)) {
      toast.error("Each guest needs a name, document number and ID photo, and any mobile number must be valid, before saving.");
      return;
    }
    if (contactError) {
      toast.error(contactError);
      return;
    }
    if (markComplete && issues.length > 0) {
      toast.error(`Cannot mark as checked in: ${issues[0].toLowerCase()}.`);
      return;
    }
    const guestPayload = buildGuestPayload(guests);
    if (payloadSize(guestPayload) > MAX_PAYLOAD_CHARS) {
      toast.error("The images are too large to save in one go. Replace some photos with smaller ones and try again.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        action: "submit" as const,
        bookingId: booking.id,
        bookingCode: String(booking.booking_code ?? ""),
        checkinData: {
          guests: guestPayload,
          expectedArrivalTime: details?.expected_arrival_time ?? "",
          needsSpecialAssistance: Boolean(details?.needs_special_assistance),
          specialAssistanceDetails: details?.special_assistance_details ?? "",
          otherRequests: details?.other_requests ?? "",
          assignedRoomIds: selectedRooms,
          contact: { phone: contactPhone.trim(), email: contactEmail.trim() },
        },
        markAsCheckedIn: markComplete,
      };

      const data = await apiPost<CheckinContext>("/admin/bookings/checkin", payload, true);
      if (!data) throw new Error("No response received from server.");
      hydrate(data, "PENDING");
      toast.success(markComplete ? "Guest checked in" : "Check-in details saved");
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    } catch (err) {
      toast.error(errorMessage(err, "Unable to save check-in"));
    } finally {
      setSaving(false);
    }
  }, [booking, context, contactError, contactEmail, contactPhone, guests, hydrate, issues, markComplete, queryClient, selectedRooms]);

  return {
    context,
    loading,
    error,
    saving,
    selectedRooms,
    toggleRoom,
    markComplete,
    setMarkComplete,
    guests,
    booked,
    issues,
    contactPhone,
    contactEmail,
    contactError,
    hasContact,
    setContactPhone,
    setContactEmail,
    updateGuest,
    addGuest,
    removeGuest,
    save,
  };
}
