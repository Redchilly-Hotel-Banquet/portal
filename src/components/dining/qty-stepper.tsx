"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QtyStepperProps {
  name: string;
  quantity: number;
  onInc: () => void;
  onDec: () => void;
  disableInc?: boolean;
  className?: string;
}

export function QtyStepper({ name, quantity, onInc, onDec, disableInc, className }: QtyStepperProps) {
  const btn =
    "inline-flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40 focus-visible:z-10";
  return (
    <div role="group" aria-label={`Quantity of ${name}`} className={cn("inline-flex items-center rounded-md border border-input bg-background", className)}>
      <button type="button" className={cn(btn, "rounded-l-md")} onClick={onDec} aria-label={`Remove one ${name}`}>
        <Minus strokeWidth={1.75} className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button type="button" className={cn(btn, "rounded-r-md")} onClick={onInc} disabled={disableInc} aria-label={`Add one ${name}`}>
        <Plus strokeWidth={1.75} className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
