"use client";

import type { Dispatch } from "react";
import { BedDouble, Minus, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatINR } from "@/components/admin/format";
import type { BookingAction, BookingFormState, BookingStepErrors } from "./use-booking-form";
import type { Pricing } from "./pricing";

interface RoomsStepProps {
  state: BookingFormState;
  dispatch: Dispatch<BookingAction>;
  pricing: Pricing;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  errors: BookingStepErrors;
}

export function RoomsStep({ state, dispatch, pricing, loading, error, onRetry, errors }: RoomsStepProps) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Checking availability">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 border border-destructive/40 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <TriangleAlert className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Availability could not be checked
        </p>
        <p className="text-muted-foreground">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (pricing.categories.length === 0) {
    return (
      <div className="border border-dashed border-border p-6 text-sm">
        <p className="font-medium">No rooms available for these dates</p>
        <p className="mt-1 text-muted-foreground">
          Go back and try different dates or another branch, or call the front desk for help.
        </p>
      </div>
    );
  }

  const guests = Number.parseInt(state.guests, 10) || 0;

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {pricing.categories.map((category) => {
          const count = state.selections[category.category] ?? 0;
          const max = Number(category.available_count ?? 0);
          const active = count > 0;
          const labelId = `cat-${category.category.replace(/\W+/g, "-")}`;
          return (
            <li
              key={category.category}
              className={cn(
                "border bg-card p-4 transition-colors sm:p-5",
                active ? "border-primary" : "border-border",
                max === 0 && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <h3 id={labelId} className="text-lg">
                    {category.category}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Sleeps up to {category.max_occupancy || 2} ·{" "}
                    {max === 0 ? "Not available for these dates" : `${max} ${max === 1 ? "room" : "rooms"} available`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg tabular-nums">{formatINR(category.min_rate)}</p>
                  <p className="text-xs text-muted-foreground">
                    per night{category.max_rate && category.max_rate !== category.min_rate ? `, up to ${formatINR(category.max_rate)}` : ""}
                  </p>
                </div>
              </div>

              {category.amenities && category.amenities.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {category.amenities.map((amenity) => (
                    <li key={amenity} className="before:mr-3 before:content-['/'] first:before:content-none">
                      {amenity}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground" id={`${labelId}-note`}>
                  {max > 0 && count >= max ? "All available rooms selected" : "Rooms"}
                </p>
                <div className="flex items-center gap-2" role="group" aria-labelledby={labelId}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => dispatch({ type: "adjustCategory", category: category.category, delta: -1, max })}
                    disabled={count <= 0}
                    aria-label={`Remove one ${category.category} room`}
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                  <span className="w-8 text-center text-base tabular-nums" aria-live="polite">
                    {count}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => dispatch({ type: "adjustCategory", category: category.category, delta: 1, max })}
                    disabled={count >= max}
                    aria-label={`Add one ${category.category} room`}
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div
        className={cn(
          "flex items-start gap-2 text-sm",
          errors.rooms ? "font-medium text-destructive" : "text-muted-foreground",
        )}
        role={errors.rooms ? "alert" : undefined}
      >
        <BedDouble className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <p>
          {errors.rooms ??
            (pricing.roomCount > 0
              ? `${pricing.roomCount} ${pricing.roomCount === 1 ? "room" : "rooms"} selected, sleeping up to ${pricing.capacity} for ${guests} ${guests === 1 ? "guest" : "guests"}.`
              : "Select at least one room to continue.")}
        </p>
      </div>
    </div>
  );
}
