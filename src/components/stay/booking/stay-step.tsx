"use client";

import type { Dispatch } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "../date-range-picker";
import { Field, fieldDescribedBy } from "../field";
import type { BookingAction, BookingFormState, BookingStepErrors } from "./use-booking-form";
import type { Outlet } from "./types";

interface StayStepProps {
  state: BookingFormState;
  dispatch: Dispatch<BookingAction>;
  outlets: Outlet[];
  outletsLoading: boolean;
  outletsError: boolean;
  errors: BookingStepErrors;
}

export function StayStep({ state, dispatch, outlets, outletsLoading, outletsError, errors }: StayStepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field
        id="outlet"
        label="Branch"
        required
        error={errors.outlet ?? (outletsError ? "Branches could not be loaded. Refresh the page to try again." : undefined)}
        className="sm:col-span-2"
      >
        <Select value={state.outletId} onValueChange={(outletId) => dispatch({ type: "setOutlet", outletId })}>
          <SelectTrigger
            id="outlet"
            aria-invalid={!!errors.outlet}
            aria-describedby={fieldDescribedBy("outlet", !!errors.outlet, false)}
          >
            <SelectValue placeholder={outletsLoading ? "Loading branches" : "Choose a branch"} />
          </SelectTrigger>
          <SelectContent>
            {outlets.map((outlet) => (
              <SelectItem key={outlet.location_key} value={outlet.location_key}>
                {outlet.location_key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="stay-dates"
        label="Dates of stay"
        required
        error={errors.range}
        hint="Check-in and check-out follow the front desk timings of the branch."
        className="sm:col-span-2"
      >
        <DateRangePicker
          id="stay-dates"
          value={state.range}
          onChange={(range) => dispatch({ type: "setRange", range })}
          invalid={!!errors.range}
          describedBy={fieldDescribedBy("stay-dates", !!errors.range, true)}
        />
      </Field>

      <Field id="guests" label="Number of guests" required error={errors.guests} hint="Up to 10 guests per online booking.">
        <Input
          id="guests"
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={state.guests}
          onChange={(e) => dispatch({ type: "setField", field: "guests", value: e.target.value })}
          aria-invalid={!!errors.guests}
          aria-describedby={fieldDescribedBy("guests", !!errors.guests, true)}
        />
      </Field>
    </div>
  );
}
