"use client";

import { useDocumentTypes } from "@/hooks/useDocumentTypes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { apiPost } from "@/lib/apiClient";
import { normaliseCheckinRuleSets, rulesForOutlet } from "@/lib/checkin-rules";
import { optionalPhoneError } from "@/lib/phone";
import type { Booking, CheckinContext } from "./types";
import {
  blankGuest,
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
  const [roomsCount, setRoomsCount] = useState("1");
  const [guestCount, setGuestCount] = useState("1");
  const [arrivingFrom, setArrivingFrom] = useState("");
  const [reasonForStay, setReasonForStay] = useState("");

  // Which documents are accepted, and how many photos each needs (this also keeps the completeness checks up to date).
  const documentTypes = useDocumentTypes();
  const rulesQuery = useQuery({
    queryKey: ["checkin-rules"],
    queryFn: () => apiPost<{ checkin_rule_sets?: unknown }>("/admin/config", { action: "get" }, true),
    select: (data) => normaliseCheckinRuleSets(data?.checkin_rule_sets),
    staleTime: 60_000,
  });
  // The rules of the booking's own branch.
  const rules = rulesForOutlet(rulesQuery.data ?? [], context?.booking?.outlet_id);

  const hydrate = useCallback((payload: CheckinContext, fallbackStatus?: string) => {
    setContext(payload);
    const seeded = seedGuests(payload);
    setGuests(seeded);
    setContactPhone(payload.booking?.guest_phone ?? "");
    setContactEmail(payload.booking?.guest_email ?? "");
    setRoomsCount(String(Math.max(Number(payload.booking?.rooms_requested) || 1, 1)));
    // The count at the top always matches the guest forms below.
    setGuestCount(String(Math.max(seeded.length, 1)));
    setArrivingFrom(payload.checkinDetails?.arriving_from ?? "");
    setReasonForStay(payload.checkinDetails?.reason_for_stay ?? "");
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

  const roomsBooked = Math.max(Math.floor(Number(roomsCount)) || 1, 1);
  const booked = Math.max(Math.floor(Number(guestCount)) || 1, 1);
  // Someone has to be reachable: the booking contact below, or any guest's own number.
  const hasPhone = Boolean(contactPhone.trim() || guests.some((guest) => guest.phone.trim()));
  const hasEmail = Boolean(contactEmail.trim());
  const contactError = optionalPhoneError(contactPhone) || (contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim()) ? "Enter a valid email address, or leave it blank." : null);
  const issues = useMemo(() => completionIssues(guests, booked, selectedRooms.length, { phone: hasPhone, email: hasEmail }, rules), [guests, booked, selectedRooms, hasPhone, hasEmail, rules, documentTypes]);

  const updateGuest = useCallback((key: string, patch: Partial<AdminGuest>) => {
    setGuests((prev) => prev.map((guest) => (guest.key === key ? { ...guest, ...patch } : guest)));
  }, []);

  // The Guests number and the guest forms move together: adding or removing a form changes the number.
  const addGuest = useCallback(() => {
    setGuests((prev) => {
      if (prev.length >= MAX_ADMIN_GUESTS) return prev;
      setGuestCount(String(prev.length + 1));
      return [...prev, blankGuest()];
    });
  }, []);

  const removeGuest = useCallback(
    (key: string) => {
      // At least one guest always stays.
      setGuests((prev) => {
        if (prev.length <= 1) return prev;
        setGuestCount(String(prev.length - 1));
        return prev.filter((guest) => guest.key !== key);
      });
    },
    [],
  );

  // Typing a new number adds blank forms, or drops empty forms from the end. A form with details is never dropped silently.
  const changeGuestCount = useCallback((value: string) => {
    setGuestCount(value);
    const wanted = Math.floor(Number(value));
    if (!Number.isFinite(wanted) || wanted < 1) return;
    const target = Math.min(wanted, MAX_ADMIN_GUESTS);
    setGuests((prev) => {
      let next = prev;
      if (target > prev.length) next = [...prev, ...Array.from({ length: target - prev.length }, () => blankGuest())];
      else {
        next = [...prev];
        while (next.length > target) {
          const last = next[next.length - 1];
          if (last.fullName.trim() || last.documentNumber.trim() || last.imageDataUrl || last.signature || last.savedIndex !== null) break;
          next.pop();
        }
      }
      if (next.length !== target) setGuestCount(String(next.length));
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!booking || !context) return;
    const details = context.checkinDetails;
    if (!Number.isInteger(Number(roomsCount)) || Number(roomsCount) < 1 || !Number.isInteger(Number(guestCount)) || Number(guestCount) < 1) {
      toast.error("Rooms and guests must be whole numbers of at least 1.");
      return;
    }
    if (!guests.every((guest) => hasDetails(guest, rules))) {
      toast.error(`Each guest needs a name${rules.document_number ? ", ID number" : ""}${rules.document_photo ? " and ID photo" : ""}, and any mobile number or age must be valid, before saving.`);
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
          roomsRequested: Number(roomsCount),
          guestsCount: Number(guestCount),
          arrivingFrom: arrivingFrom.trim(),
          reasonForStay: reasonForStay.trim(),
          assignedRoomIds: selectedRooms,
          contact: { phone: contactPhone.trim(), email: contactEmail.trim() },
        },
        markAsCheckedIn: markComplete,
      };

      const data = await apiPost<CheckinContext>("/admin/bookings/checkin", payload, true);
      if (!data) throw new Error("No response received from server.");
      hydrate(data, "CONFIRMED");
      toast.success(markComplete ? "Guest checked in" : "Check-in details saved");
      queryClient.invalidateQueries({ queryKey: BOOKINGS_KEY });
    } catch (err) {
      toast.error(errorMessage(err, "Unable to save check-in"));
    } finally {
      setSaving(false);
    }
  }, [booking, context, contactError, contactEmail, contactPhone, roomsCount, guestCount, arrivingFrom, reasonForStay, guests, hydrate, issues, markComplete, queryClient, rules, selectedRooms]);

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
    roomsBooked,
    roomsCount,
    guestCount,
    setRoomsCount,
    setGuestCount: changeGuestCount,
    issues,
    rules,
    contactPhone,
    contactEmail,
    contactError,
    hasPhone,
    hasEmail,
    setContactPhone,
    setContactEmail,
    arrivingFrom,
    reasonForStay,
    setArrivingFrom,
    setReasonForStay,
    updateGuest,
    addGuest,
    removeGuest,
    save,
  };
}
