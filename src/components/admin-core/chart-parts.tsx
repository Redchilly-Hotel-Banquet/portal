"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export const AXIS = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };
export const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--foreground))", fontWeight: 500 },
  itemStyle: { color: "hsl(var(--popover-foreground))" },
  cursor: { stroke: "hsl(var(--border))" },
};

const SLICE_COLOURS = ["--primary", "--brass", "--success", "--warning", "--destructive", "--muted-foreground"];
const MAX_SLICES = 6;

export type Slice = { name: string; value: number };

/** Largest slices first; anything beyond the palette is folded into "Other". */
const fold = (slices: Slice[]): Slice[] => {
  const sorted = slices.filter((slice) => slice.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES) return sorted;
  const rest = sorted.slice(MAX_SLICES - 1).reduce((sum, slice) => sum + slice.value, 0);
  return [...sorted.slice(0, MAX_SLICES - 1), { name: "Other", value: rest }];
};

export function PieBreakdown({
  slices,
  label,
  format,
  empty = "Nothing recorded yet.",
}: {
  slices: Slice[];
  label: string;
  format: (value: number) => string;
  empty?: string;
}) {
  const data = fold(slices);
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (data.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="h-[260px] w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2} stroke="hsl(var(--card))">
            {data.map((slice, index) => (
              <Cell key={slice.name} fill={`hsl(var(${SLICE_COLOURS[index % SLICE_COLOURS.length]}))`} />
            ))}
          </Pie>
          <Tooltip
            {...tooltipStyle}
            formatter={(value: number, name: string) => [`${format(value)} (${total ? Math.round((value / total) * 100) : 0}%)`, name]}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
