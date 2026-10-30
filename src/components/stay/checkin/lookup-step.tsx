"use client";

import type { Dispatch } from "react";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldDescribedBy } from "../field";
import type { CheckinAction, CheckinErrors, CheckinFormState } from "./use-checkin-form";
import { BOOKING_READY_STATUSES } from "./types";
import { statusLabel } from "@/components/admin/status-badge";

interface LookupStepProps {
  state: CheckinFormState;
  dispatch: Dispatch<CheckinAction>;
  errors: CheckinErrors;
  loading: boolean;
  onLookup: () => void;
  onContinue: () => void;
}

export function LookupStep({ state, dispatch, errors, loading, onLookup, onContinue }: LookupStepProps) {
  const send = dispatch;
  const booking = state.booking;

  if (booking) {
    const ready = BOOKING_READY_STATUSES.includes(String(booking.status ?? "").toUpperCase());
    return (
      <div className="space-y-6">
        <div className="border border-border bg-card p-5">
          <p className="eyebrow">Booking found</p>
          <p className="mt-2 font-display text-xl">{booking.guest_name}</p>
          <p className="mt-1 font-mono text-sm tracking-wider text-muted-foreground">{booking.booking_code}</p>
        </div>
        {ready ? (
          <p className="text-sm text-muted-foreground">
            This booking is {statusLabel(booking.status).toLowerCase()}. Continue to add guest details and identity
            documents.
          </p>
        ) : (
          <p role="alert" className="border border-warning/40 p-4 text-sm">
            This booking is still <strong>{statusLabel(booking.status ?? "CONFIRMED").toLowerCase()}</strong>. Online
            check-in opens once the front desk confirms it. Please call the hotel if you need it confirmed sooner.
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => send({ type: "reset" })}>
            Use a different booking
          </Button>
          <Button type="button" size="lg" onClick={onContinue} disabled={!ready}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onLookup();
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="booking-code" label="Booking code" required error={errors.bookingCode} hint="Printed on your booking confirmation.">
          <Input
            id="booking-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="RC-ABC123"
            value={state.bookingCode}
            onChange={(e) => send({ type: "setField", field: "bookingCode", value: e.target.value })}
            aria-invalid={!!errors.bookingCode}
            aria-describedby={fieldDescribedBy("booking-code", !!errors.bookingCode, true)}
            className="font-mono uppercase tracking-wider"
          />
        </Field>
        <Field id="last-name" label="Last name" required error={errors.lastName} hint="As given for the booking.">
          <Input
            id="last-name"
            autoComplete="family-name"
            value={state.lastName}
            onChange={(e) => send({ type: "setField", field: "lastName", value: e.target.value })}
            aria-invalid={!!errors.lastName}
            aria-describedby={fieldDescribedBy("last-name", !!errors.lastName, true)}
          />
        </Field>
      </div>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Searching
          </>
        ) : (
          <>
            <Search className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Find booking
          </>
        )}
      </Button>
    </form>
  );
}
