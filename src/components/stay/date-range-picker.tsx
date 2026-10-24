"use client";

import { useState } from "react";
import { format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  id: string;
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  invalid?: boolean;
  describedBy?: string;
}

const fmt = (d: Date) => format(d, "EEE, d MMM yyyy");

export function DateRangePicker({ id, value, onChange, invalid, describedBy }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const today = startOfDay(new Date());

  const handleSelect = (next: DateRange | undefined) => {
    // Same-day range is not a stay: keep only the arrival date so the guest picks a departure.
    if (next?.from && next.to && next.from.getTime() === next.to.getTime()) {
      onChange({ from: next.from, to: undefined });
      return;
    }
    onChange(next);
    if (next?.from && next.to) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full justify-start px-3 text-left font-normal",
            !value?.from && "text-muted-foreground",
            invalid && "border-destructive",
          )}
        >
          <CalendarDays className="mr-2 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate">
            {value?.from
              ? value.to
                ? `${fmt(value.from)}  to  ${fmt(value.to)}`
                : `${fmt(value.from)}  to  select departure`
              : "Select arrival and departure"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={value}
          onSelect={handleSelect}
          defaultMonth={value?.from ?? today}
          disabled={{ before: today }}
          className="max-w-full overflow-x-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
