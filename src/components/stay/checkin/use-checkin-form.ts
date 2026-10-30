"use client";

import { useReducer } from "react";
import { optionalPhoneError, tenDigitPhone } from "@/lib/phone";
import {
  DOCUMENT_TYPES,
  type CheckinBooking,
  type CheckinDetails,
  type GuestEntry,
} from "./types";

export interface CheckinFormState {
  bookingCode: string;
  lastName: string;
  /** Normalised values used for the successful lookup, replayed on submit. */
  lookup: { bookingCode: string; lastName: string } | null;
  booking: CheckinBooking | null;
  details: CheckinDetails | null;
  guests: GuestEntry[];
  expectedArrival: string;
  needsAssistance: boolean;
  assistanceDetails: string;
  otherRequests: string;
  /** Guests added by reception beyond the booked count. Kept by the server, never edited here. */
  extraGuests: number;
}

let counter = 0;
const nextKey = () => `guest-${++counter}`;

export const blankGuest = (): GuestEntry => ({
  key: nextKey(),
  fullName: "",
  phone: "",
  documentType: DOCUMENT_TYPES[0].value,
  documentNumber: "",
  imageDataUrl: "",
  imageName: "",
  imageType: "",
  signature: "",
  savedIndex: null,
  savedImage: "",
  savedSignature: "",
});

export const initialCheckinState: CheckinFormState = {
  bookingCode: "",
  lastName: "",
  lookup: null,
  booking: null,
  details: null,
  guests: [],
  expectedArrival: "",
  needsAssistance: false,
  assistanceDetails: "",
  otherRequests: "",
  extraGuests: 0,
};

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function prefill(booking: CheckinBooking, details: CheckinDetails | null): Partial<CheckinFormState> {
  const saved = details?.guests ?? [];
  const booked = Math.max(Math.floor(Number(booking.number_of_guests ?? 1)) || 1, 1);
  // Once guests have been saved, only they are shown: a booking for three can be checked in for one.
  const count = saved.length > 0 ? Math.min(saved.length, booked) : booked;
  const guests: GuestEntry[] = Array.from({ length: count }, (_, index) => {
    const g = saved[index];
    // The booker is guest 1: start from the name and phone given when the booking was made.
    if (!g) return index === 0 ? { ...blankGuest(), fullName: booking.guest_name?.trim() ?? "", phone: tenDigitPhone(booking.guest_phone) ?? "" } : blankGuest();
    const image = g.document_image?.data_url ?? "";
    const signature = g.signature_image?.data_url ?? "";
    return {
      key: nextKey(),
      fullName: g.full_name ?? "",
      // The booker is guest 1, so their booking phone is the natural starting point.
      phone: g.phone ?? (index === 0 ? tenDigitPhone(booking.guest_phone) ?? "" : ""),
      documentType: g.document_type || DOCUMENT_TYPES[0].value,
      documentNumber: g.document_number ?? "",
      imageDataUrl: image,
      imageName: g.document_image?.file_name ?? "",
      imageType: g.document_image?.mime_type ?? "",
      signature,
      savedIndex: index,
      savedImage: image,
      savedSignature: signature,
    };
  });

  return {
    booking,
    details,
    guests,
    expectedArrival: toDateTimeLocal(details?.expected_arrival_time),
    needsAssistance: Boolean(details?.needs_special_assistance),
    assistanceDetails: details?.special_assistance_details ?? "",
    otherRequests: details?.other_requests ?? "",
    extraGuests: Math.max(saved.length - booked, 0),
  };
}

export type CheckinAction =
  | { type: "setField"; field: "bookingCode" | "lastName" | "expectedArrival" | "assistanceDetails" | "otherRequests"; value: string }
  | { type: "setAssistance"; value: boolean }
  | { type: "lookupDone"; booking: CheckinBooking; details: CheckinDetails | null; lookup: { bookingCode: string; lastName: string } }
  | { type: "saved"; booking: CheckinBooking; details: CheckinDetails | null }
  | { type: "updateGuest"; key: string; patch: Partial<GuestEntry> }
  | { type: "removeGuest"; key: string }
  | { type: "addGuest" }
  | { type: "reset" };

function reducer(state: CheckinFormState, action: CheckinAction): CheckinFormState {
  switch (action.type) {
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setAssistance":
      return { ...state, needsAssistance: action.value, assistanceDetails: action.value ? state.assistanceDetails : "" };
    case "lookupDone":
      return { ...state, lookup: action.lookup, ...prefill(action.booking, action.details) };
    case "saved":
      return { ...state, ...prefill(action.booking, action.details) };
    case "updateGuest":
      return { ...state, guests: state.guests.map((g) => (g.key === action.key ? { ...g, ...action.patch } : g)) };
    case "removeGuest":
      // At least one guest always stays.
      return state.guests.length > 1 ? { ...state, guests: state.guests.filter((g) => g.key !== action.key) } : state;
    case "addGuest": {
      const booked = Math.max(Math.floor(Number(state.booking?.number_of_guests ?? 1)) || 1, 1);
      return state.guests.length < booked ? { ...state, guests: [...state.guests, blankGuest()] } : state;
    }
    case "reset":
      return initialCheckinState;
    default:
      return state;
  }
}

export function useCheckinForm() {
  return useReducer(reducer, initialCheckinState);
}

export type CheckinErrors = Record<string, string>;

export function validateLookup(state: CheckinFormState): CheckinErrors {
  const errors: CheckinErrors = {};
  if (!state.bookingCode.trim()) errors.bookingCode = "Enter the booking code from your confirmation.";
  if (!state.lastName.trim()) errors.lastName = "Enter the guest's last name.";
  return errors;
}

export function validateGuests(guests: GuestEntry[]): CheckinErrors {
  const errors: CheckinErrors = {};
  guests.forEach((guest) => {
    if (!guest.fullName.trim()) errors[`${guest.key}.name`] = "Enter the guest's full name.";
    const phoneErr = optionalPhoneError(guest.phone);
    if (phoneErr) errors[`${guest.key}.phone`] = phoneErr;
    const number = guest.documentNumber.trim();
    if (!number) errors[`${guest.key}.number`] = "Enter the document number.";
    else if (guest.documentType === "Aadhar Card" && number.replace(/\s/g, "").length !== 12)
      errors[`${guest.key}.number`] = "An Aadhaar number has 12 digits.";
    else if (number.length < 5) errors[`${guest.key}.number`] = "This looks too short. Please check the number.";
    if (!guest.imageDataUrl) errors[`${guest.key}.image`] = "Add a photo of the identity document.";
    if (!guest.signature) errors[`${guest.key}.signature`] = "This guest needs to sign.";
  });
  return errors;
}
