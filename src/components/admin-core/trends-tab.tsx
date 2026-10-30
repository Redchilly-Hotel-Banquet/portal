"use client";

import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { BedDouble, CalendarCheck, IndianRupee, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { StatCard } from "@/components/admin/stat-card";
import { formatINR, formatNumber } from "@/components/admin/format";
import { apiPost } from "@/lib/apiClient";
import { paymentModeLabel } from "@/lib/payment-modes";
import { RangePicker, type Range } from "./range-picker";
import { AXIS, PieBreakdown, compact, tooltipStyle } from "./chart-parts";
import { bucketLabel, type TrendsInsights } from "./analytics-insights-types";

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="text-lg">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A ranked list with a proportional bar, for the dishes. */
function Ranked({ rows }: { rows: Array<{ label: string; value: number; display: string; note?: string }> }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing recorded for this period.</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-medium">{row.display}</span>
              {row.note ? <span className="ml-2 text-xs text-muted-foreground">{row.note}</span> : null}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrendsTab({ outlets, range, onRangeChange }: { outlets: string[]; range: Range; onRangeChange: (range: Range) => void }) {

  const query = useQuery({
    queryKey: ["analytics-trends", range.from, range.to, outlets],
    queryFn: () => apiPost<TrendsInsights>("/admin/analytics/insights", { view: "trends", ...range, outlets }, true),
    placeholderData: (previous) => previous,
  });
  const data = query.data;
  const days = differenceInCalendarDays(parseISO(range.to), parseISO(range.from)) + 1;
  const series = (data?.series ?? []).map((row) => ({ ...row, name: bucketLabel(row.bucket) }));

  return (
    <div className="space-y-6">
      <RangePicker value={range} onChange={(next) => next && onRangeChange(next)} idPrefix="trend" />
      <p className="-mt-3 text-xs text-muted-foreground">
        Shown per {days <= 92 ? "day" : "month"}. Bookings and orders are counted on the day they were created (India time). Cancelled ones are left out.
      </p>

      {!data ? (
        query.isError ? (
          <EmptyState title="Trends could not be loaded" description="Check your connection and try again." />
        ) : (
          <Skeleton className="h-96 w-full rounded-md" />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Total income" value={<Money value={data.totals.income} />} icon={IndianRupee} hint="Rooms and food" />
            <StatCard label="Bookings" value={formatNumber(data.totals.bookings)} icon={CalendarCheck} hint={data.totals.busiest ? `Busiest: ${bucketLabel(data.totals.busiest)}` : undefined} />
            <StatCard label="Room income" value={<Money value={data.totals.room_income} />} icon={BedDouble} />
            <StatCard label="Food orders" value={formatNumber(data.totals.food_orders)} icon={ShoppingBag} />
            <StatCard label="Food income" value={<Money value={data.totals.food_income} />} icon={UtensilsCrossed} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Income over time" description="Room bookings against food orders.">
              <div className="h-[300px] w-full" role="img" aria-label="Line chart of room and food income over the chosen period">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact.format(v)} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => formatINR(v)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="room_income" name="Rooms" stroke="hsl(var(--brass))" strokeWidth={2} dot={series.length < 3 ? { r: 3 } : false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="food_income" name="Food" stroke="hsl(var(--primary))" strokeWidth={2} dot={series.length < 3 ? { r: 3 } : false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Bookings and food orders over time" description="How many of each.">
              <div className="h-[300px] w-full" role="img" aria-label="Line chart of bookings and food orders over the chosen period">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="bookings" name="Bookings" stroke="hsl(var(--brass))" strokeWidth={2} dot={series.length < 3 ? { r: 3 } : false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="food_orders" name="Food orders" stroke="hsl(var(--primary))" strokeWidth={2} dot={series.length < 3 ? { r: 3 } : false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Income split" description="Rooms against food.">
              <PieBreakdown
                label="Pie chart of room and food income"
                format={formatINR}
                slices={[
                  { name: "Rooms", value: data.totals.room_income },
                  { name: "Food", value: data.totals.food_income },
                ]}
              />
            </Panel>
            <Panel title="Room types booked" description="Share of bookings by room category. A booking of several types counts once for each.">
              <PieBreakdown label="Pie chart of bookings by room type" format={(v) => `${formatNumber(v)} bookings`} slices={data.room_types.map((row) => ({ name: row.type, value: row.bookings }))} />
            </Panel>
            <Panel title="Food sales by category">
              <PieBreakdown label="Pie chart of food sales by category" format={formatINR} slices={data.food_categories.map((row) => ({ name: row.category || "Other", value: row.sales }))} />
            </Panel>
            <Panel title="Payments by source" description="Received at check-out for stays booked in this period.">
              <PieBreakdown label="Pie chart of payments by source" format={formatINR} slices={data.payments.map((row) => ({ name: paymentModeLabel(row.mode), value: row.amount }))} />
            </Panel>
          </div>

          <Panel title="Most sold food items" description="By quantity ordered.">
            <Ranked
              rows={data.top_items.map((row) => ({
                label: row.category ? `${row.name} (${row.category})` : row.name,
                value: row.quantity,
                display: `${formatNumber(row.quantity)} sold`,
                note: formatINR(row.sales),
              }))}
            />
          </Panel>

          <section className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg">By branch</h2>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Room income</TableHead>
                    <TableHead className="text-right">Food orders</TableHead>
                    <TableHead className="text-right">Food income</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.branches.map((row) => (
                    <TableRow key={row.outlet_id}>
                      <TableCell className="font-medium">{row.outlet_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.bookings)}</TableCell>
                      <TableCell className="text-right"><Money value={row.room_income} /></TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(row.food_orders)}</TableCell>
                      <TableCell className="text-right"><Money value={row.food_income} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
