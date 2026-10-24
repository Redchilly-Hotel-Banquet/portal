import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepDef {
  id: string;
  label: string;
}

interface StepperProps {
  steps: StepDef[];
  current: number;
  className?: string;
}

/** Hairline progress indicator. Completed steps show a check, the current step is marked for assistive tech. */
export function Stepper({ steps, current, className }: StepperProps) {
  return (
    <nav aria-label="Progress" className={className}>
      <p className="mb-3 text-xs text-muted-foreground sm:hidden" aria-hidden="true">
        Step {current + 1} of {steps.length}
        <span className="text-foreground"> · {steps[current]?.label}</span>
      </p>
      <ol className="flex gap-2 sm:gap-4">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.id} className="min-w-0 flex-1" aria-current={active ? "step" : undefined}>
              <div
                className={cn(
                  "h-0.5 w-full",
                  done || active ? "bg-primary" : "bg-border",
                  active && "bg-foreground",
                )}
              />
              <div className="mt-2 hidden items-center gap-2 text-xs sm:flex">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-foreground text-foreground",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "truncate",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                  {done && <span className="sr-only"> (completed)</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
