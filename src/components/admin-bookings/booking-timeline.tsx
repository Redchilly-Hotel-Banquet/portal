import { formatDateTime, formatDate } from "@/components/admin/format";
import type { Booking } from "./types";

type Step = { label: string; at?: string; done: boolean; note?: string };

const buildSteps = (booking: Booking): Step[] => {
  const steps: Step[] = [
    { label: "Reservation recorded", at: booking.created_at, done: true },
    {
      label: "Arrival",
      at: booking.checked_in_at,
      done: Boolean(booking.checked_in_at),
      note: booking.checked_in_at ? undefined : `Due ${formatDate(booking.check_in_date)}`,
    },
    {
      label: "Departure",
      at: booking.checked_out_at,
      done: Boolean(booking.checked_out_at),
      note: booking.checked_out_at ? undefined : `Due ${formatDate(booking.check_out_date)}`,
    },
  ];
  if (booking.status === "CANCELLED") {
    return [
      steps[0],
      { label: "Cancelled", at: booking.updated_at, done: true },
    ];
  }
  return steps;
};

export function BookingTimeline({ booking }: { booking: Booking }) {
  const steps = buildSteps(booking);
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex gap-3 pl-1">
          {index < steps.length - 1 ? (
            <span className="absolute left-[7px] top-4 h-[calc(100%+0.25rem)] w-px bg-border" aria-hidden />
          ) : null}
          <span
            className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${
              step.done ? "border-primary bg-primary" : "border-border bg-background"
            }`}
            aria-hidden
          />
          <div className="text-sm">
            <p className={step.done ? "font-medium" : "text-muted-foreground"}>{step.label}</p>
            <p className="text-xs text-muted-foreground">{step.at ? formatDateTime(step.at) : step.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
