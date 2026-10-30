"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/components/admin/format";
import { roomRevenue, toNumber, type OutletAnalytics } from "./analytics-types";

const AXIS = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 500 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted))", opacity: 0.6 },
};

type Props = { outlets: OutletAnalytics[] };

export function RevenueSplitChart({ outlets }: Props) {
  const data = outlets.map((o) => ({
    name: o.outlet_name,
    food: toNumber(o.food_revenue),
    room: roomRevenue(o),
  }));

  return (
    <div className="h-[320px] w-full" role="img" aria-label="Stacked bar chart of food and room revenue by branch">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => formatINR(v)} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="food" name="Food and beverage" stackId="revenue" fill="hsl(var(--primary))" maxBarSize={56} />
          <Bar dataKey="room" name="Rooms" stackId="revenue" fill="hsl(var(--brass))" maxBarSize={56} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActivityChart({ outlets }: Props) {
  const data = outlets.map((o) => ({
    name: o.outlet_name,
    orders: toNumber(o.total_orders),
    bookings: toNumber(o.total_bookings),
  }));

  return (
    <div className="h-[320px] w-full" role="img" aria-label="Bar chart of orders and bookings by branch">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="orders" name="Orders" fill="hsl(var(--primary))" maxBarSize={32} radius={[2, 2, 0, 0]} />
          <Bar dataKey="bookings" name="Bookings" fill="hsl(var(--brass))" maxBarSize={32} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
