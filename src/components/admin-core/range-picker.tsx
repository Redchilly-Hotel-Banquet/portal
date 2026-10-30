"use client";

import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfYear, subDays, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MAX_MONTHS = 12;
export type Range = { from: string; to: string };

const iso = (date: Date) => format(date, "yyyy-MM-dd");
const earliestFor = (to: string) => iso(addDays(subMonths(parseISO(to), MAX_MONTHS), 1));

/** The shortest period, so a screen opens with as little to compute as possible. */
export const defaultRange = (): Range => ({ from: iso(new Date()), to: iso(new Date()) });

export const rangePresets = (): Array<{ label: string; range: Range }> => {
  const today = new Date();
  const lastYear = new Date(today.getFullYear() - 1, 0, 1);
  return [
    { label: "Today", range: { from: iso(today), to: iso(today) } },
    { label: "Last 7 days", range: { from: iso(subDays(today, 6)), to: iso(today) } },
    { label: "Last 30 days", range: { from: iso(subDays(today, 29)), to: iso(today) } },
    { label: "Last 3 months", range: { from: iso(addDays(subMonths(today, 3), 1)), to: iso(today) } },
    { label: "Last 6 months", range: { from: iso(addDays(subMonths(today, 6), 1)), to: iso(today) } },
    { label: "Last 12 months", range: { from: iso(addDays(subMonths(today, 12), 1)), to: iso(today) } },
    { label: "This year", range: { from: iso(startOfYear(today)), to: iso(today) } },
    { label: "Last year", range: { from: iso(lastYear), to: `${lastYear.getFullYear()}-12-31` } },
  ];
};

type Props = {
  /** null means all time; only valid with `allowAll`. */
  value: Range | null;
  onChange: (range: Range | null) => void;
  allowAll?: boolean;
  idPrefix: string;
};

export function RangePicker({ value, onChange, allowAll, idPrefix }: Props) {
  const today = iso(new Date());
  const shown = value ?? { from: "", to: "" };

  const change = (next: Range, changed: "from" | "to") => {
    let { from, to } = next;
    if (!from) from = to;
    if (!to) to = from;
    if (changed === "from") {
      if (to < from) to = from;
      const cap = iso(subDays(addMonths(parseISO(from), MAX_MONTHS), 1));
      if (to > cap) to = cap;
    } else {
      if (from > to) from = to;
      if (from < earliestFor(to)) from = earliestFor(to);
    }
    onChange({ from, to });
  };

  const days = value ? differenceInCalendarDays(parseISO(value.to), parseISO(value.from)) + 1 : 0;

  return (
    <section aria-label="Time range" className="space-y-3 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-from`} className="text-xs">From</Label>
          <Input id={`${idPrefix}-from`} type="date" className="w-40" value={shown.from} max={today} onChange={(e) => e.target.value && change({ ...shown, from: e.target.value }, "from")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-to`} className="text-xs">To</Label>
          <Input id={`${idPrefix}-to`} type="date" className="w-40" value={shown.to} min={shown.from || undefined} max={today} onChange={(e) => e.target.value && change({ ...shown, to: e.target.value }, "to")} />
        </div>
        <p className="pb-2 text-sm text-muted-foreground tabular-nums">
          {value ? `${days} day${days === 1 ? "" : "s"}.` : "All time."} Up to 1 year at a time.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
        {allowAll ? (
          <Button type="button" size="sm" variant={value === null ? "default" : "outline"} onClick={() => onChange(null)}>
            All time
          </Button>
        ) : null}
        {rangePresets().map((preset) => (
          <Button key={preset.label} type="button" size="sm" variant={value && preset.range.from === value.from && preset.range.to === value.to ? "default" : "outline"} onClick={() => onChange(preset.range)}>
            {preset.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
