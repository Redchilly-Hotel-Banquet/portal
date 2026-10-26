"use client";

import { addDays, format, subMonths } from "date-fns";
import { X } from "lucide-react";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BOOKING_STATUSES, type OutletOption } from "./types";

export type BookingFilterState = {
  status: string;
  outlet: string;
  search: string;
  from: string;
  to: string;
};

/** Reception mostly works with guests who are in the hotel, so that is the tab it opens on. */
export const INITIAL_FILTERS: BookingFilterState = { status: "CHECKED_IN", outlet: "all", search: "", from: "", to: "" };

const iso = (date: Date) => format(date, "yyyy-MM-dd");

/** Quick stay-date ranges, counted back from today. */
const PRESETS: Array<{ label: string; range: () => { from: string; to: string } }> = [
  { label: "Today", range: () => ({ from: iso(new Date()), to: iso(new Date()) }) },
  { label: "Past 7 days", range: () => ({ from: iso(addDays(new Date(), -6)), to: iso(new Date()) }) },
  { label: "Past month", range: () => ({ from: iso(addDays(subMonths(new Date(), 1), 1)), to: iso(new Date()) }) },
];

type Props = {
  filters: BookingFilterState;
  onChange: (next: BookingFilterState) => void;
  outlets: OutletOption[];
  counts: Record<string, number>;
  actions?: React.ReactNode;
};

export function BookingFilters({ filters, onChange, outlets, counts, actions }: Props) {
  const patch = (partial: Partial<BookingFilterState>) => onChange({ ...filters, ...partial });
  const dirty = filters.outlet !== "all" || filters.from !== "" || filters.to !== "" || filters.search !== "";

  return (
    <div className="space-y-4">
      <div className="-mx-1 overflow-x-auto px-1">
        <Tabs value={filters.status} onValueChange={(status) => patch({ status })}>
          <TabsList className="h-auto w-max justify-start gap-1 bg-transparent p-0">
            {[{ value: "all", label: "All" }, ...BOOKING_STATUSES].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2 rounded-sm border border-transparent px-3 py-1.5 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:shadow-none"
              >
                {tab.label}
                <span className="tabular-nums text-xs text-muted-foreground">{counts[tab.value] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <DataToolbar
        search={filters.search}
        onSearchChange={(search) => patch({ search })}
        searchPlaceholder="Search guest, code, phone or room"
        filters={
          <>
            <Select value={filters.outlet} onValueChange={(outlet) => patch({ outlet })}>
              <SelectTrigger className="w-[180px]" aria-label="Filter by branch">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {outlets.map((outlet) => (
                  <SelectItem key={outlet.location_key} value={outlet.location_key}>
                    {outlet.name ?? outlet.location_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => patch({ from: e.target.value })}
                aria-label="Stay from"
                className="w-[9.5rem]"
              />
              <span className="text-xs text-muted-foreground" aria-hidden>
                to
              </span>
              <Input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => patch({ to: e.target.value })}
                aria-label="Stay until"
                className="w-[9.5rem]"
              />
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Quick date ranges">
              {PRESETS.map((preset) => {
                const range = preset.range();
                const active = filters.from === range.from && filters.to === range.to;
                return (
                  <Button
                    key={preset.label}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    onClick={() => patch(range)}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
            {dirty ? (
              <Button variant="ghost" size="sm" onClick={() => onChange({ ...INITIAL_FILTERS, status: filters.status })}>
                <X className="mr-1.5 h-4 w-4" strokeWidth={1.75} aria-hidden />
                Reset
              </Button>
            ) : null}
          </>
        }
        actions={actions}
      />
    </div>
  );
}
