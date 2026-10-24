"use client";

import type { Dispatch } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldDescribedBy } from "../field";
import type { BookingAction, BookingFormState, BookingStepErrors } from "./use-booking-form";

interface GuestStepProps {
  state: BookingFormState;
  dispatch: Dispatch<BookingAction>;
  errors: BookingStepErrors;
}

export function GuestStep({ state, dispatch, errors }: GuestStepProps) {
  const set = (field: "name" | "email" | "phone" | "requests") => (value: string) =>
    dispatch({ type: "setField", field, value });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field id="guest-name" label="Full name" required error={errors.name}>
        <Input
          id="guest-name"
          autoComplete="name"
          value={state.name}
          onChange={(e) => set("name")(e.target.value)}
          aria-invalid={!!errors.name}
          aria-describedby={fieldDescribedBy("guest-name", !!errors.name, false)}
        />
      </Field>
      <Field id="guest-phone" label="Phone number" required error={errors.phone} hint="The front desk may call to confirm.">
        <Input
          id="guest-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={state.phone}
          onChange={(e) => set("phone")(e.target.value)}
          aria-invalid={!!errors.phone}
          aria-describedby={fieldDescribedBy("guest-phone", !!errors.phone, true)}
        />
      </Field>
      <Field id="guest-email" label="Email" optional error={errors.email} className="sm:col-span-2">
        <Input
          id="guest-email"
          type="email"
          autoComplete="email"
          value={state.email}
          onChange={(e) => set("email")(e.target.value)}
          aria-invalid={!!errors.email}
          aria-describedby={fieldDescribedBy("guest-email", !!errors.email, false)}
        />
      </Field>
      <Field
        id="guest-requests"
        label="Special requests"
        optional
        hint="Floor preference, early arrival, celebrations. We will do our best but cannot guarantee."
        className="sm:col-span-2"
      >
        <Textarea
          id="guest-requests"
          rows={4}
          value={state.requests}
          onChange={(e) => set("requests")(e.target.value)}
          aria-describedby="guest-requests-hint"
        />
      </Field>
    </div>
  );
}
