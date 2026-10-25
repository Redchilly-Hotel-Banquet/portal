import { format } from "date-fns";
import { formatINR } from "@/components/admin/format";
import type { BookingFormState } from "./use-booking-form";
import type { Pricing } from "./pricing";
import { rateOf, roomTotal } from "./pricing";

interface BookingSummaryProps {
  state: BookingFormState;
  nights: number;
  pricing: Pricing;
  finalTotal: number;
  isStaff: boolean;
  hasOverride: boolean;
  /** False on the first step: a room is pre-selected by default there, but the guest has not chosen one yet. */
  roomsChosen: boolean;
}

export function BookingSummary({ state, nights, pricing, finalTotal, isStaff, hasOverride, roomsChosen }: BookingSummaryProps) {
  const { from, to } = state.range ?? {};

  return (
    <aside aria-label="Booking summary" className="border border-border bg-card p-5 lg:sticky lg:top-24">
      <p className="eyebrow">Your booking</p>
      <h2 className="mt-2 text-xl">Summary</h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Branch</dt>
          <dd className="text-right">{state.outletId || "Not selected"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Arrival</dt>
          <dd className="text-right tabular-nums">{from ? format(from, "d MMM yyyy") : "-"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Departure</dt>
          <dd className="text-right tabular-nums">{to ? format(to, "d MMM yyyy") : "-"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Nights</dt>
          <dd className="text-right tabular-nums">{nights || "-"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Guests</dt>
          <dd className="text-right tabular-nums">{Number.parseInt(state.guests, 10) || "-"}</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-border pt-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Rooms</p>
        {!roomsChosen || pricing.chosen.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No rooms selected yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {pricing.chosen.map((room, index) => (
              <li key={room.id ?? index} className="flex justify-between gap-4">
                <span className="min-w-0">
                  {room.category}
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {formatINR(rateOf(room))} x {nights || 1} {(nights || 1) === 1 ? "night" : "nights"}
                  </span>
                </span>
                <span className="tabular-nums">{formatINR(roomTotal(room, nights))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {roomsChosen && (
      <div className="mt-5 border-t border-border pt-4">
        {isStaff && hasOverride && (
          <div className="mb-2 flex justify-between text-sm text-muted-foreground">
            <span>Estimate</span>
            <span className="tabular-nums line-through">{formatINR(pricing.estimatedTotal)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm">{hasOverride ? "Negotiated total" : "Estimated total"}</span>
          <span className="font-display text-2xl tabular-nums">{formatINR(finalTotal)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Taxes and final allocation are confirmed by the hotel.</p>
      </div>
      )}
    </aside>
  );
}
