"use client";

import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** The longest period that can be viewed at once. */
export const MAX_PERIOD_MONTHS = 6;

export type Period = { from: string; to: string };

const iso = (date: Date) => format(date, "yyyy-MM-dd");

/** Last day of a period that starts on `from`: the day before the same date six months on. */
const latestEnd = (from: string) => iso(subDays(addMonths(parseISO(from), MAX_PERIOD_MONTHS), 1));

export const defaultPeriod = (): Period => {
  const today = new Date();
  return { from: iso(today), to: iso(today) };
};

/** Keeps a period valid: from is not after to, and it never spans more than six months. */
const fit = (period: Period, changed: "from" | "to"): Period => {
  let { from, to } = period;
  if (changed === "from") {
    if (to < from) to = from;
    const cap = latestEnd(from);
    if (to > cap) to = cap;
  } else {
    if (from > to) from = to;
    const earliest = iso(addDays(subMonths(parseISO(to), MAX_PERIOD_MONTHS), 1));
    if (from < earliest) from = earliest;
  }
  return { from, to };
};

const presets = (): Array<{ label: string; period: Period }> => {
  const today = new Date();
  return [
    { label: "Today", period: { from: iso(today), to: iso(today) } },
    { label: "Last 7 days", period: { from: iso(subDays(today, 6)), to: iso(today) } },
    { label: "Last 30 days", period: { from: iso(subDays(today, 29)), to: iso(today) } },
    { label: "This month", period: { from: iso(startOfMonth(today)), to: iso(today) } },
    { label: "Last month", period: { from: iso(startOfMonth(subMonths(today, 1))), to: iso(subDays(startOfMonth(today), 1)) } },
    { label: "Last 3 months", period: { from: iso(addDays(subMonths(today, 3), 1)), to: iso(today) } },
    { label: "Last 6 months", period: { from: iso(addDays(subMonths(today, MAX_PERIOD_MONTHS), 1)), to: iso(today) } },
  ];
};

export const periodLabel = ({ from, to }: Period) =>
  from === to ? format(parseISO(from), "d MMM yyyy") : `${format(parseISO(from), "d MMM yyyy")} to ${format(parseISO(to), "d MMM yyyy")}`;

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  const today = iso(new Date());
  const days = differenceInCalendarDays(parseISO(value.to), parseISO(value.from)) + 1;

  return (
    <section aria-label="Period" className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="period-from" className="text-xs">From</Label>
          <Input
            id="period-from"
            type="date"
            className="w-40"
            value={value.from}
            max={today}
            onChange={(e) => e.target.value && onChange(fit({ ...value, from: e.target.value }, "from"))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="period-to" className="text-xs">To</Label>
          <Input
            id="period-to"
            type="date"
            className="w-40"
            value={value.to}
            min={value.from}
            max={today}
            onChange={(e) => e.target.value && onChange(fit({ ...value, to: e.target.value }, "to"))}
          />
        </div>
        <p className="pb-2 text-sm text-muted-foreground tabular-nums">
          {days} day{days === 1 ? "" : "s"}. Up to {MAX_PERIOD_MONTHS} months at a time.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick periods">
        {presets().map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant={preset.period.from === value.from && preset.period.to === value.to ? "default" : "outline"}
            onClick={() => onChange(preset.period)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
