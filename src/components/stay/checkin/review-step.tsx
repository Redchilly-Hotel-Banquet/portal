"use client";

import { CircleCheck, CircleAlert } from "lucide-react";
import { formatDateTime } from "@/components/admin/format";
import type { CheckinFormState } from "./use-checkin-form";
import { DOCUMENT_TYPES } from "./types";

export function ReviewStep({ state }: { state: CheckinFormState }) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg">Review</h3>
        <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
          {state.guests.map((guest, index) => (
            <div key={guest.key} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground">
                Guest {index + 1} of {state.guests.length}
              </dt>
              <dd className="break-words">
                {guest.fullName.trim()}
                <span className="block text-muted-foreground">
                  {DOCUMENT_TYPES.find((d) => d.value === guest.documentType)?.label ?? guest.documentType}
                  {" · "}
                  {guest.documentNumber.trim()}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {[
                    [Boolean(guest.imageDataUrl), "ID photo attached", "ID photo missing"],
                    [Boolean(guest.signature), "Signed", "Not signed"],
                  ].map(([ok, yes, no]) => (
                    <span key={String(yes)} className={ok ? "inline-flex items-center gap-1 text-success" : "inline-flex items-center gap-1 text-destructive"}>
                      {ok ? (
                        <CircleCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      )}
                      {ok ? String(yes) : String(no)}
                    </span>
                  ))}
                </span>
              </dd>
            </div>
          ))}
          {state.extraGuests > 0 && (
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground">Added by reception</dt>
              <dd>
                {state.extraGuests} additional guest{state.extraGuests === 1 ? "" : "s"}, kept as is
              </dd>
            </div>
          )}
          <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
            <dt className="text-muted-foreground">Expected arrival</dt>
            <dd>{state.expectedArrival ? formatDateTime(state.expectedArrival) : "Not specified"}</dd>
          </div>
          {state.needsAssistance && (
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground">Assistance</dt>
              <dd className="whitespace-pre-line">{state.assistanceDetails.trim() || "Requested"}</dd>
            </div>
          )}
          {state.otherRequests.trim() && (
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground">Requests</dt>
              <dd className="whitespace-pre-line">{state.otherRequests.trim()}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          On arrival, reception verifies the original documents and completes your check-in. Submitting this form
          does not mark you as checked in.
        </p>
      </div>
    </div>
  );
}
