"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getAdminScopes, hasAdminScope } from "@/hooks/useAdminAccess";
import { useProfile } from "@/hooks/useAccount";
import { Stepper, type StepDef } from "../stepper";
import { StayStep } from "./stay-step";
import { RoomsStep } from "./rooms-step";
import { GuestStep } from "./guest-step";
import { ReviewStep } from "./review-step";
import { BookingSummary } from "./booking-summary";
import { BookingConfirmation, type ConfirmationData } from "./confirmation";
import { derivePricing } from "./pricing";
import {
  useBookingForm,
  validateGuest,
  validateStay,
  type BookingStepErrors,
} from "./use-booking-form";
import type { AvailabilityResponse, BookingResponse, Outlet } from "./types";

const STEPS: Array<StepDef & { title: string; description: string }> = [
  { id: "stay", label: "Stay", title: "Branch and dates", description: "Choose where and when you would like to stay." },
  { id: "rooms", label: "Rooms", title: "Choose rooms", description: "Rates and availability are shown for your dates." },
  { id: "guest", label: "Guest", title: "Guest details", description: "Who should we contact about this booking?" },
  { id: "review", label: "Review", title: "Review and confirm", description: "Check everything before sending your request." },
];

export function BookingFlow() {
  const { state, dispatch, nights } = useBookingForm();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<BookingStepErrors>({});
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const { account, profile, save: saveProfile } = useProfile();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    setIsStaff(hasAdminScope(getAdminScopes(), ["admin", "rooms"]));
  }, []);

  // Autofill guest details from the signed-in account, never overwriting what was typed.
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    const fill = (field: "name" | "email" | "phone", value: string | null | undefined, current: string) => {
      if (value && !current.trim()) dispatch({ type: "setField", field, value });
    };
    fill("name", profile.name, state.name);
    fill("email", profile.email ?? account?.email, state.email);
    fill("phone", profile.phone, state.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const outletsQuery = useQuery({
    queryKey: ["public", "outlets"],
    queryFn: () => apiGet<{ outlets: Outlet[] }>("/public/outlets"),
  });

  const from = state.range?.from;
  const to = state.range?.to;
  const fromKey = from ? format(from, "yyyy-MM-dd") : "";
  const toKey = to ? format(to, "yyyy-MM-dd") : "";
  const canQuery = !!state.outletId && !!fromKey && !!toKey && nights > 0;

  const availabilityQuery = useQuery({
    queryKey: ["public", "availability", state.outletId, fromKey, toKey],
    enabled: canQuery,
    queryFn: () =>
      apiPost<AvailabilityResponse>("/public/rooms/availability", {
        outlet_id: state.outletId,
        check_in_date: fromKey,
        check_out_date: toKey,
      }),
  });

  const availability = canQuery ? availabilityQuery.data : undefined;
  const pricing = useMemo(
    () => derivePricing(availability, state.selections, nights),
    [availability, state.selections, nights],
  );
  const categoryList = useMemo(() => derivePricing(availability, {}, nights).categories, [availability, nights]);

  useEffect(() => {
    if (availability) dispatch({ type: "syncCategories", categories: categoryList });
  }, [availability, categoryList, dispatch]);

  // Move focus to the step heading when the step changes (not on first paint).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = confirmation ? document.getElementById("confirmation-title") : headingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step, confirmation]);

  const negotiated = state.negotiatedTotal?.trim() ?? "";
  const parsedNegotiated = Number(negotiated);
  const hasOverride = isStaff && negotiated.length > 0 && Number.isFinite(parsedNegotiated);
  const finalTotal = Number((hasOverride ? parsedNegotiated : pricing.estimatedTotal).toFixed(2));

  const book = useMutation({
    mutationFn: () => {
      const picked = Object.entries(state.selections).filter(([, n]) => n > 0);
      // The API requires a single preferred_room_type; use the category with the most rooms.
      const dominant = [...picked].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return apiPost<BookingResponse>("/public/bookings", {
        outlet_id: state.outletId,
        rooms_requested: pricing.roomCount,
        preferred_room_type: dominant,
        preferred_categories: picked.length ? Object.fromEntries(picked) : undefined,
        guest_name: state.name.trim(),
        guest_email: state.email.trim(),
        guest_phone: state.phone.trim(),
        check_in_date: fromKey,
        check_out_date: toKey,
        number_of_guests: Number.parseInt(state.guests, 10),
        total_amount: finalTotal,
        special_requests: state.requests.trim(),
      });
    },
    onSuccess: (data) => {
      if (!data?.booking) {
        toast.error("The booking could not be confirmed. Please try again or call the front desk.");
        return;
      }
      void saveProfile({ name: state.name, phone: state.phone });
      setConfirmation({
        booking: data.booking,
        rooms: Object.entries(state.selections)
          .filter(([, n]) => n > 0)
          .map(([category, count]) => ({ category, count })),
        nights,
        total: finalTotal,
        outlet: state.outletId,
      });
    },
    onError: (error: Error) => toast.error(error.message || "Booking failed. Please try again."),
  });

  const validateStep = (index: number): BookingStepErrors => {
    if (index === 0) return validateStay(state, nights);
    if (index === 1) {
      const out: BookingStepErrors = {};
      const guests = Number.parseInt(state.guests, 10) || 0;
      if (pricing.roomCount <= 0) out.rooms = "Select at least one room to continue.";
      else if (pricing.shortCategory)
        out.rooms = `${pricing.shortCategory} no longer has enough rooms. Adjust your selection.`;
      else if (pricing.chosen.length !== pricing.roomCount)
        out.rooms = "Fewer rooms are available than you selected. Adjust the counts.";
      else if (guests > pricing.capacity)
        out.rooms = `The selected rooms sleep up to ${pricing.capacity} guests. Add a room or reduce the guest count.`;
      return out;
    }
    if (index === 2) return validateGuest(state);
    if (hasOverrideInvalid()) return { negotiated: "Enter a valid amount of zero or more." };
    return {};
  };

  function hasOverrideInvalid() {
    return isStaff && negotiated.length > 0 && (!Number.isFinite(parsedNegotiated) || parsedNegotiated < 0);
  }

  const next = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else book.mutate();
  };

  const back = () => {
    setErrors({});
    setStep(Math.max(step - 1, 0));
  };

  if (confirmation) {
    return (
      <div className="page-container py-10 md:py-14">
        <BookingConfirmation data={confirmation} />
      </div>
    );
  }

  const current = STEPS[step];
  const loadingAvailability = canQuery && availabilityQuery.isLoading;
  const availabilityError = canQuery && availabilityQuery.isError ? (availabilityQuery.error as Error).message : null;
  const isLast = step === STEPS.length - 1;
  const blocked = step === 1 && (loadingAvailability || !!availabilityError || pricing.categories.length === 0);

  return (
    <div className="page-container py-10 md:py-14">
      <Stepper steps={STEPS} current={step} className="mb-10" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          aria-labelledby="step-title"
        >
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 id="step-title" ref={headingRef} tabIndex={-1} className="mt-2 text-2xl tracking-tight outline-none sm:text-3xl">
            {current.title}
          </h2>
          <p className="mt-2 text-muted-foreground">{current.description}</p>

          <div className="mt-8">
            {step === 0 && (
              <StayStep
                state={state}
                dispatch={dispatch}
                outlets={outletsQuery.data?.outlets ?? []}
                outletsLoading={outletsQuery.isLoading}
                outletsError={outletsQuery.isError}
                errors={errors}
              />
            )}
            {step === 1 && (
              <RoomsStep
                state={state}
                dispatch={dispatch}
                pricing={{ ...pricing, categories: categoryList }}
                loading={loadingAvailability}
                error={availabilityError}
                onRetry={() => availabilityQuery.refetch()}
                errors={errors}
              />
            )}
            {step === 2 && <GuestStep state={state} dispatch={dispatch} errors={errors} />}
            {step === 3 && (
              <ReviewStep
                state={state}
                dispatch={dispatch}
                pricing={pricing}
                nights={nights}
                isStaff={isStaff}
                errors={errors}
              />
            )}
          </div>

          <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={back} disabled={book.isPending}>
                <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Back
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="lg" disabled={book.isPending || blocked}>
              {book.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending request
                </>
              ) : isLast ? (
                "Confirm booking"
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </>
              )}
            </Button>
          </div>
        </form>

        <BookingSummary
          state={state}
          nights={nights}
          pricing={pricing}
          finalTotal={finalTotal}
          isStaff={isStaff}
          hasOverride={hasOverride}
          roomsChosen={step >= 1}
        />
      </div>
    </div>
  );
}
