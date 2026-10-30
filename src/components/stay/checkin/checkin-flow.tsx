"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useProfile } from "@/hooks/useAccount";
import { useSavedDetails } from "@/components/profile/queries";
import { ApiError, apiPost } from "@/lib/apiClient";
import { Stepper, type StepDef } from "../stepper";
import { LookupStep } from "./lookup-step";
import { CheckinLocked } from "./locked-view";
import { GuestsStep } from "./guests-step";
import { ArrivalStep } from "./arrival-step";
import { ReviewStep } from "./review-step";
import { CheckinSummary } from "./checkin-summary";
import { CheckinConfirmation } from "./checkin-confirmation";
import {
  useCheckinForm,
  validateGuests,
  validateLookup,
  type CheckinErrors,
} from "./use-checkin-form";
import type { CheckinBooking, CheckinDetails, CheckinResponse } from "./types";

const STEPS: Array<StepDef & { title: string; description: string }> = [
  { id: "find", label: "Find booking", title: "Find your booking", description: "Enter the booking code and the guest's last name." },
  { id: "guests", label: "Guests", title: "Guest details", description: "Add each guest's details, ID photo and signature." },
  { id: "arrival", label: "Arrival", title: "Arrival and requests", description: "Let us know when to expect you and what you need." },
  { id: "sign", label: "Review and submit", title: "Review and submit", description: "Check everything before you send it." },
];

/** Vercel rejects request bodies above ~4.5MB; keep a margin for the JSON envelope. */
const MAX_PAYLOAD_CHARS = 4_000_000;

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error ? error.message : fallback;

export function CheckinFlow() {
  const [state, dispatch] = useCheckinForm();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<CheckinErrors>({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [locked, setLocked] = useState<{ booking: CheckinBooking; details: CheckinDetails | null } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  const params = useSearchParams();
  const codeParam = (params.get("code") ?? "").trim().toUpperCase();
  const { account, profile } = useProfile();
  const saved = useSavedDetails(Boolean(account));
  const [saveToProfile, setSaveToProfile] = useState(false);
  const autoLookup = useRef(false);
  const prefilledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target = done ? document.getElementById("checkin-done") : headingRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [step, done]);

  const runLookup = async (bookingCode: string, lastName: string) => {
    setLookupLoading(true);
    try {
      const context = { bookingCode, lastName };
      // The token (when signed in) lets the booking's owner skip the last-name check.
      const data = await apiPost<CheckinResponse>("/public/bookings/checkin", { action: "lookup", ...context }, "user");
      if (!data?.booking) throw new Error("Booking not found. Please verify the details and try again.");
      if (data.locked) {
        setLocked({ booking: data.booking, details: data.checkinDetails ?? null });
        return;
      }
      dispatch({ type: "lookupDone", booking: data.booking, details: data.checkinDetails ?? null, lookup: context });
    } catch (error) {
      toast.error(messageOf(error, "Unable to locate the booking."));
    } finally {
      setLookupLoading(false);
    }
  };

  const lookup = async () => {
    const found = validateLookup(state);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await runLookup(state.bookingCode.trim().toUpperCase(), state.lastName.trim());
  };

  // Arriving from "Start check-in" on the profile page: open that booking straight away.
  useEffect(() => {
    if (!codeParam || autoLookup.current || account === undefined) return;
    autoLookup.current = true;
    dispatch({ type: "setField", field: "bookingCode", value: codeParam });
    if (account) void runLookup(codeParam, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeParam, account]);

  // Fill the first guest and the signature from the saved profile, once per booking.
  useEffect(() => {
    const booking = state.booking;
    if (!booking || !account || !profile || !saved.isSuccess || prefilledFor.current === booking.id) return;
    prefilledFor.current = booking.id;

    const details = saved.data;
    const first = state.guests[0];
    const bookedName = booking.guest_name?.trim() ?? "";
    const guestIsBlank = first && first.savedIndex === null && (!first.fullName || first.fullName === bookedName) && !first.documentNumber && !first.imageDataUrl;
    let filled = false;
    const fillSignature = first && !first.signature && details.signatureDataUrl ? details.signatureDataUrl : "";

    if (guestIsBlank && (details.documentNumber || details.documentImageDataUrl || profile?.name)) {
      const mime = /^data:(image\/[a-z]+);/.exec(details.documentImageDataUrl)?.[1] ?? "";
      dispatch({
        type: "updateGuest",
        key: first.key,
        patch: {
          fullName: first.fullName || profile?.name || "",
          documentType: details.documentType || first.documentType,
          documentNumber: details.documentNumber,
          imageDataUrl: details.documentImageDataUrl,
          imageName: details.documentImageDataUrl ? "saved-id" : "",
          imageType: mime,
          ...(fillSignature ? { signature: fillSignature } : {}),
        },
      });
      filled = Boolean(details.documentNumber || details.documentImageDataUrl || fillSignature);
    } else if (fillSignature) {
      dispatch({ type: "updateGuest", key: first.key, patch: { signature: fillSignature } });
      filled = true;
    }
    if (filled) toast.info("Filled in from your profile. Check each field before you submit.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.booking, account, profile, saved.isSuccess]);

  /** Optional, explicit opt-in: remember the first guest's ID and the signature for next time. */
  const saveDetailsToProfile = async () => {
    const guest = state.guests[0];
    const body: Record<string, unknown> = {};
    if (guest?.documentNumber.trim()) {
      body.documentType = guest.documentType;
      body.documentNumber = guest.documentNumber.trim();
    }
    if (guest?.imageDataUrl.startsWith("data:image/")) body.documentImageDataUrl = guest.imageDataUrl;
    if (guest?.signature) body.signatureDataUrl = guest.signature;
    if (Object.keys(body).length === 0) return;
    try {
      await apiPost("/me/details", body, "user");
      toast.success("Saved to your profile for next time");
    } catch (error) {
      toast.error(`Your check-in was submitted, but we could not save it to your profile: ${messageOf(error, "please try again from My profile")}`);
    }
  };

  const submit = async () => {
    if (!state.booking || !state.lookup) {
      toast.error("Please locate a booking before submitting check-in details.");
      return;
    }

    const checkinData: Record<string, unknown> = {
      guests: state.guests.map((guest, index) => {
        const sameSlot = guest.savedIndex === index;
        const imageUnchanged = sameSlot && guest.imageDataUrl === guest.savedImage;
        const signatureUnchanged = sameSlot && guest.signature === guest.savedSignature;
        return {
          fullName: guest.fullName.trim(),
          phone: guest.phone.trim(),
          documentType: guest.documentType,
          documentNumber: guest.documentNumber.trim(),
          // The server keeps the saved image and signature by index, so unchanged ones are not re-sent.
          documentImageDataUrl: imageUnchanged ? undefined : guest.imageDataUrl,
          documentImageName: imageUnchanged ? undefined : guest.imageName,
          documentImageType: imageUnchanged ? undefined : guest.imageType,
          signatureDataUrl: signatureUnchanged ? undefined : guest.signature,
        };
      }),
      expectedArrivalTime: state.expectedArrival,
      needsSpecialAssistance: state.needsAssistance,
      specialAssistanceDetails: state.needsAssistance ? state.assistanceDetails.trim() : "",
      otherRequests: state.otherRequests.trim(),
    };
    const payload = {
      action: "submit",
      bookingId: state.booking.id,
      bookingCode: state.lookup.bookingCode,
      lastName: state.lookup.lastName,
      checkinData,
    };
    if (JSON.stringify(payload).length > MAX_PAYLOAD_CHARS) {
      toast.error("The photos are too large to send together. Retake smaller photos or submit fewer guests at once.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiPost<CheckinResponse>("/public/bookings/checkin", payload);
      if (!data?.booking) throw new Error("Unable to save check-in data. Please try again.");
      dispatch({ type: "saved", booking: data.booking, details: data.checkinDetails ?? null });
      setDone(true);
      if (saveToProfile && account) await saveDetailsToProfile();
    } catch (error) {
      toast.error(messageOf(error, "Failed to save check-in details."));
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    let found: CheckinErrors = {};
    if (step === 1) found = validateGuests(state.guests);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit();
  };

  const startOver = () => {
    dispatch({ type: "reset" });
    setErrors({});
    setStep(0);
    setDone(false);
    setLocked(null);
  };

  if (locked) {
    return (
      <div className="page-container py-10 md:py-14">
        <CheckinLocked booking={locked.booking} details={locked.details} onUseAnother={startOver} />
      </div>
    );
  }

  if (done && state.booking) {
    return (
      <div className="page-container py-10 md:py-14">
        <CheckinConfirmation
          booking={state.booking}
          onEdit={() => {
            setDone(false);
            setStep(1);
          }}
        />
      </div>
    );
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="page-container py-10 md:py-14">
      <Stepper steps={STEPS} current={step} className="mb-10" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <p className="eyebrow">
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-2 text-2xl tracking-tight outline-none sm:text-3xl">
            {current.title}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {step === 1 && state.booking
              ? `This booking is for ${state.booking.number_of_guests ?? state.guests.length} ${Number(state.booking.number_of_guests ?? state.guests.length) === 1 ? "guest" : "guests"}. Add the details, ID photo and signature of each guest who is arriving. Anyone not coming can be removed.`
              : current.description}
          </p>

          <div className="mt-8">
            {step === 0 && (
              <LookupStep
                state={state}
                dispatch={dispatch}
                errors={errors}
                loading={lookupLoading}
                onLookup={lookup}
                onContinue={() => setStep(1)}
              />
            )}
            {step > 0 && (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  next();
                }}
              >
                {step === 1 && (
                  <GuestsStep
                    guests={state.guests}
                    errors={errors}
                    extraGuests={state.extraGuests}
                    canAdd={state.guests.length < Math.max(Math.floor(Number(state.booking?.number_of_guests ?? 1)) || 1, 1)}
                    onUpdate={(key, patch) => dispatch({ type: "updateGuest", key, patch })}
                    onRemove={(key) => dispatch({ type: "removeGuest", key })}
                    onAdd={() => dispatch({ type: "addGuest" })}
                  />
                )}
                {step === 2 && <ArrivalStep state={state} dispatch={dispatch} />}
                {step === 3 && <ReviewStep state={state} />}
                {step === 3 && account ? (
                  <div className="mt-8 flex items-start gap-3 rounded-md border border-border p-4">
                    <Checkbox
                      id="save-to-profile"
                      checked={saveToProfile}
                      onCheckedChange={(value) => setSaveToProfile(value === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="save-to-profile" className="text-sm leading-relaxed">
                      Save the first guest&apos;s ID and my signature to my profile
                      <span className="block text-muted-foreground">
                        Encrypted, and used only to prefill your next check-in. You can remove it any time from My profile.
                      </span>
                    </label>
                  </div>
                ) : null}

                <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting}
                    onClick={() => {
                      setErrors({});
                      setStep(step - 1);
                    }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Back
                  </Button>
                  <Button type="submit" size="lg" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        Saving
                      </>
                    ) : isLast ? (
                      <>
                        <Send className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Submit check-in details
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>
          {state.booking && step > 0 && (
            <p className="mt-6 text-xs text-muted-foreground">
              Wrong booking?{" "}
              <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={startOver}>
                Start over
              </button>
            </p>
          )}
        </div>

        <CheckinSummary booking={state.booking} details={state.details} />
      </div>
    </div>
  );
}
