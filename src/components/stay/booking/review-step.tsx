"use client";

import type { Dispatch } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/components/admin/format";
import { Field, fieldDescribedBy } from "../field";
import type { BookingAction, BookingFormState, BookingStepErrors } from "./use-booking-form";
import type { Pricing } from "./pricing";

interface ReviewStepProps {
  state: BookingFormState;
  dispatch: Dispatch<BookingAction>;
  pricing: Pricing;
  nights: number;
  isStaff: boolean;
  errors: BookingStepErrors;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

export function ReviewStep({ state, dispatch, pricing, nights, isStaff, errors }: ReviewStepProps) {
  const { from, to } = state.range ?? {};
  const rooms = Object.entries(state.selections).filter(([, n]) => n > 0);
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-border border-y border-border">
        <Row label="Branch">{state.outletId}</Row>
        <Row label="Stay">
          {from && to ? `${format(from, "EEE, d MMM yyyy")} to ${format(to, "EEE, d MMM yyyy")}` : "-"}
          <span className="text-muted-foreground">
            {" "}
            · {nights} {nights === 1 ? "night" : "nights"}
          </span>
        </Row>
        <Row label="Rooms">
          {rooms.map(([category, n]) => (
            <span key={category} className="block">
              {n} x {category}
            </span>
          ))}
        </Row>
        <Row label="Guests">{state.guests}</Row>
        <Row label="Booked by">
          {state.name.trim()}
          <span className="block text-muted-foreground">{state.phone.trim()}</span>
          {state.email.trim() && <span className="block text-muted-foreground">{state.email.trim()}</span>}
        </Row>
        {state.requests.trim() && <Row label="Requests"><span className="whitespace-pre-line">{state.requests.trim()}</span></Row>}
      </dl>

      {isStaff && (
        <Field
          id="negotiated-total"
          label="Negotiated total (INR)"
          optional
          error={errors.negotiated}
          hint="Staff only. Leave blank to use the estimate."
        >
          <Input
            id="negotiated-total"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={state.negotiatedTotal ?? ""}
            placeholder={pricing.estimatedTotal.toFixed(2)}
            onChange={(e) => dispatch({ type: "setNegotiated", value: e.target.value === "" ? null : e.target.value })}
            aria-invalid={!!errors.negotiated}
            aria-describedby={fieldDescribedBy("negotiated-total", !!errors.negotiated, true)}
          />
        </Field>
      )}

      <p className="text-sm text-muted-foreground">
        Your request is sent to the front desk as <span className="text-foreground">pending</span>. Specific room
        numbers are allotted at check-in and the final amount is confirmed by the hotel. {formatINR(pricing.estimatedTotal)}{" "}
        is an estimate based on current rates.
      </p>
    </div>
  );
}
