"use client";

import { useReducer } from "react";
import { differenceInCalendarDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { CategoryEntry, Selections } from "./types";

export interface BookingFormState {
  outletId: string;
  range: DateRange | undefined;
  guests: string;
  selections: Selections;
  name: string;
  email: string;
  phone: string;
  requests: string;
  /** Staff-only negotiated total. null means "not edited, use the estimate". */
  negotiatedTotal: string | null;
}

export const initialBookingState: BookingFormState = {
  outletId: "",
  range: undefined,
  guests: "2",
  selections: {},
  name: "",
  email: "",
  phone: "",
  requests: "",
  negotiatedTotal: null,
};

type TextField = "guests" | "name" | "email" | "phone" | "requests";

export type BookingAction =
  | { type: "setOutlet"; outletId: string }
  | { type: "setRange"; range: DateRange | undefined }
  | { type: "setField"; field: TextField; value: string }
  | { type: "setNegotiated"; value: string | null }
  | { type: "adjustCategory"; category: string; delta: 1 | -1; max: number }
  | { type: "syncCategories"; categories: CategoryEntry[] };

function reducer(state: BookingFormState, action: BookingAction): BookingFormState {
  switch (action.type) {
    case "setOutlet":
      // Availability is per branch, so a different branch invalidates the room choice.
      return action.outletId === state.outletId
        ? state
        : { ...state, outletId: action.outletId, selections: {}, negotiatedTotal: null };
    case "setRange":
      return { ...state, range: action.range, selections: {}, negotiatedTotal: null };
    case "setField":
      return { ...state, [action.field]: action.value };
    case "setNegotiated":
      return { ...state, negotiatedTotal: action.value };
    case "adjustCategory": {
      const current = state.selections[action.category] ?? 0;
      const next = Math.min(Math.max(current + action.delta, 0), action.max);
      if (next === current) return state;
      const selections = { ...state.selections };
      if (next === 0) delete selections[action.category];
      else selections[action.category] = next;
      return { ...state, selections, negotiatedTotal: null };
    }
    case "syncCategories": {
      // Drop categories that vanished, clamp counts to availability, and pre-select the
      // cheapest available category when nothing is chosen yet.
      const next: Selections = {};
      for (const entry of action.categories) {
        const wanted = state.selections[entry.category] ?? 0;
        const allowed = Math.min(wanted, Number(entry.available_count ?? 0));
        if (allowed > 0) next[entry.category] = allowed;
      }
      if (Object.keys(next).length === 0) {
        const first = action.categories.find((c) => Number(c.available_count ?? 0) > 0);
        if (first) next[first.category] = 1;
      }
      const same =
        Object.keys(next).length === Object.keys(state.selections).length &&
        Object.entries(next).every(([key, value]) => state.selections[key] === value);
      return same ? state : { ...state, selections: next, negotiatedTotal: null };
    }
    default:
      return state;
  }
}

export function useBookingForm() {
  const [state, dispatch] = useReducer(reducer, initialBookingState);
  const { from, to } = state.range ?? {};
  const nights = from && to ? Math.max(differenceInCalendarDays(to, from), 0) : 0;
  return { state, dispatch, nights };
}

export type BookingStepErrors = Partial<Record<"outlet" | "range" | "guests" | "rooms" | "name" | "email" | "phone" | "negotiated", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStay(state: BookingFormState, nights: number): BookingStepErrors {
  const errors: BookingStepErrors = {};
  if (!state.outletId) errors.outlet = "Choose a branch.";
  if (!state.range?.from || !state.range.to) errors.range = "Select your arrival and departure dates.";
  else if (nights < 1) errors.range = "Departure must be after arrival.";
  const guests = Number.parseInt(state.guests, 10);
  if (!Number.isFinite(guests) || guests < 1) errors.guests = "Enter at least 1 guest.";
  else if (guests > 10) errors.guests = "Online bookings are limited to 10 guests. Please call us for larger groups.";
  return errors;
}

export function validateGuest(state: BookingFormState): BookingStepErrors {
  const errors: BookingStepErrors = {};
  if (!state.name.trim()) errors.name = "Enter the guest's full name.";
  const digits = state.phone.replace(/\D/g, "");
  if (!state.phone.trim()) errors.phone = "Enter a phone number.";
  else if (digits.length < 10 || digits.length > 15) errors.phone = "Enter a valid phone number with 10 to 15 digits.";
  if (state.email.trim() && !EMAIL.test(state.email.trim())) errors.email = "Enter a valid email address.";
  return errors;
}
