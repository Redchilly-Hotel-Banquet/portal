"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { StatCard } from "@/components/admin/stat-card";
import { formatDate, formatNumber } from "@/components/admin/format";
import { PieBreakdown } from "./chart-parts";
import { formatINR } from "@/components/admin/format";
import { apiPost } from "@/lib/apiClient";
import { paymentModeLabel } from "@/lib/payment-modes";
import { RangePicker, type Range } from "./range-picker";
import type { GuestInsight, GuestsInsights } from "./analytics-insights-types";

const sumBy = (
  guests: GuestInsight[],
  pick: (guest: GuestInsight) => Record<string, number>,
  label: (key: string) => string = (key) => key,
) => {
  const totals = new Map<string, number>();
  for (const guest of guests) for (const [key, value] of Object.entries(pick(guest))) totals.set(key, (totals.get(key) ?? 0) + value);
  return Array.from(totals, ([key, value]) => ({ name: label(key), value }));
};

const entries = (record: Record<string, number>) => Object.entries(record).sort((a, b) => b[1] - a[1]);

export function GuestsTab({ outlets, range, onRangeChange }: { outlets: string[]; range: Range; onRangeChange: (range: Range) => void }) {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["analytics-guests", range.from, range.to, outlets],
    queryFn: () => apiPost<GuestsInsights>("/admin/analytics/insights", { view: "guests", ...range, outlets }, true),
    placeholderData: (previous) => previous,
  });

  const guests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = query.data?.guests ?? [];
    if (!q) return all;
    return all.filter((guest) => [guest.name, guest.phone, guest.email].some((value) => value.toLowerCase().includes(q)));
  }, [query.data, search]);

  const top = query.data?.guests[0];

  return (
    <div className="space-y-6">
      <RangePicker value={range} onChange={(next) => next && onRangeChange(next)} idPrefix="guest" />
      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, phone or email"
      />

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-md" />
      ) : query.isError ? (
        <EmptyState title="Guest analytics could not be loaded" description="Check your connection and try again." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Guests" value={formatNumber(query.data?.total_guests ?? 0)} hint="With at least one booking" />
            <StatCard label="Returning guests" value={formatNumber(query.data?.repeat_guests ?? 0)} hint="Booked more than once" />
            <StatCard label="Most bookings" value={top ? formatNumber(top.bookings) : "-"} hint={top?.name || undefined} />
          </div>

          {guests.length > 0 ? (
            <div className="grid gap-6 xl:grid-cols-3">
              {[
                { title: "Room types", note: "Bookings by room category", slices: sumBy(guests, (g) => g.room_types), format: (v: number) => `${formatNumber(v)} bookings` },
                { title: "Payment sources", note: "Paid at check-out", slices: sumBy(guests, (g) => g.payments, paymentModeLabel), format: formatINR },
                {
                  title: "Spend split",
                  note: "Rooms against food",
                  slices: [
                    { name: "Rooms", value: guests.reduce((sum, g) => sum + g.room_spend, 0) },
                    { name: "Food", value: guests.reduce((sum, g) => sum + g.food_spend, 0) },
                  ],
                  format: formatINR,
                },
              ].map((chart) => (
                <section key={chart.title} className="rounded-md border border-border bg-card p-5">
                  <h2 className="text-lg">{chart.title}</h2>
                  <p className="mb-2 mt-1 text-sm text-muted-foreground">{chart.note}, for the guests listed below.</p>
                  <PieBreakdown label={`Pie chart: ${chart.title}`} format={chart.format} slices={chart.slices} />
                </section>
              ))}
            </div>
          ) : null}

          {guests.length === 0 ? (
            <EmptyState title="No guests found" description="Adjust the search, time range or branches." />
          ) : (
            <section className="rounded-md border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-lg">Guests by number of bookings</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Top {query.data?.guests.length} guests, ties broken by total spend. Cancelled bookings and orders are left out. Guests are matched by account, phone or email.
                </p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead>Room types</TableHead>
                      <TableHead className="text-right">Room spend</TableHead>
                      <TableHead className="text-right">Food spend</TableHead>
                      <TableHead className="text-right">Total spend</TableHead>
                      <TableHead>Paid by</TableHead>
                      <TableHead>Last booked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guests.map((guest) => (
                      <TableRow key={guest.key}>
                        <TableCell className="min-w-44">
                          <p className="font-medium">{guest.name || "Unnamed guest"}</p>
                          <p className="text-xs text-muted-foreground">{guest.phone || guest.email || "-"}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(guest.bookings)}
                          <span className="block text-xs text-muted-foreground">{formatNumber(guest.nights)} nights</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {entries(guest.room_types).map(([type, count]) => (
                              <Badge key={type} variant="secondary">{type} x{count}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right"><Money value={guest.room_spend} /></TableCell>
                        <TableCell className="text-right">
                          <Money value={guest.food_spend} />
                          <span className="block text-xs text-muted-foreground">{formatNumber(guest.food_orders)} orders</span>
                        </TableCell>
                        <TableCell className="text-right font-medium"><Money value={guest.total_spend} /></TableCell>
                        <TableCell className="min-w-36 text-sm">
                          {Object.keys(guest.payments).length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            entries(guest.payments).map(([mode, amount]) => (
                              <p key={mode} className="whitespace-nowrap">
                                {paymentModeLabel(mode)} <Money value={amount} className="text-muted-foreground" />
                              </p>
                            ))
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(guest.last_booking)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
