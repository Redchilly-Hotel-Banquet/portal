import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderStatusKey } from "./types";

export const ORDER_STEPS: { key: OrderStatusKey; label: string; detail: string }[] = [
  { key: "PENDING", label: "Order received", detail: "We have your order." },
  { key: "ACCEPTED", label: "Accepted", detail: "The kitchen has acknowledged it." },
  { key: "PREPARING", label: "Preparing", detail: "Your food is being prepared." },
  { key: "READY", label: "Ready", detail: "Our team is bringing it to you." },
  { key: "DELIVERED", label: "Delivered", detail: "Served. Enjoy your meal." },
];

/** The kitchen closes a delivered order for billing (ORDER_FINISHED); guests simply see it as delivered. */
export const isOrderDelivered = (status: string | null | undefined) => {
  const key = (status ?? "").toUpperCase();
  return key === "DELIVERED" || key === "ORDER_FINISHED";
};

export const stepIndex = (status: string | null | undefined) => {
  const key = (status ?? "").toUpperCase();
  return ORDER_STEPS.findIndex((s) => s.key === (key === "ORDER_FINISHED" ? "DELIVERED" : key));
};

export const stepFor = (status: string | null | undefined) => ORDER_STEPS[stepIndex(status)];

export function OrderProgress({ status }: { status: string }) {
  const current = stepIndex(status);
  return (
    <ol className="relative" aria-label="Order progress">
      {ORDER_STEPS.map((step, i) => {
        const last = i === ORDER_STEPS.length - 1;
        // Delivered is the final step: once reached it is complete, not "in progress".
        const done = i < current || (i === current && last);
        const active = i === current && !done;
        return (
          <li key={step.key} className="relative flex gap-4 pb-6 last:pb-0" aria-current={active ? "step" : undefined}>
            {!last && (
              <span
                aria-hidden
                className={cn("absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px", i < current ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary bg-background",
                !done && !active && "border-border bg-background",
              )}
            >
              {done ? <Check strokeWidth={2} className="h-3.5 w-3.5" /> : active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>
                {step.label}
                <span className="sr-only">{done ? " (complete)" : active ? " (current)" : " (upcoming)"}</span>
              </p>
              {(active || done) && <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
