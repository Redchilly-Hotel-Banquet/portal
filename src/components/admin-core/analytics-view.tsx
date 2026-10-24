"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, CalendarCheck, Download, IndianRupee, RefreshCw, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/admin/empty-state";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { Money } from "@/components/admin/money";
import { formatNumber } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiPost } from "@/lib/apiClient";
import {
  ANALYTICS_QUERY_KEY,
  roomRevenue,
  sumOutlets,
  toNumber,
  type OutletAnalytics,
  type SortKey,
} from "./analytics-types";
import { ActivityChart, RevenueSplitChart } from "./revenue-charts";

const SORT_LABEL: Record<SortKey, string> = {
  revenue: "Revenue",
  orders: "Orders",
  bookings: "Bookings",
  name: "Name",
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function ChartPanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="text-lg">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

export function AnalyticsView() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [branch, setBranch] = useState("all");

  const { data: outlets = [], isLoading, isError, isFetching, refetch } = useQuery<OutletAnalytics[]>({
    queryKey: ANALYTICS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiPost<{ outlets: OutletAnalytics[] }>("/admin/analytics/outlets", {}, true);
      return res?.outlets ?? [];
    },
    refetchInterval: 30000,
  });

  const scoped = useMemo(
    () => (branch === "all" ? outlets : outlets.filter((o) => o.outlet_id === branch)),
    [outlets, branch],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? scoped.filter((o) => o.outlet_name?.toLowerCase().includes(q)) : scoped;
    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "revenue":
          return toNumber(b.total_revenue) - toNumber(a.total_revenue);
        case "orders":
          return toNumber(b.total_orders) - toNumber(a.total_orders);
        case "bookings":
          return toNumber(b.total_bookings) - toNumber(a.total_bookings);
        default:
          return (a.outlet_name || "").localeCompare(b.outlet_name || "");
      }
    });
  }, [scoped, search, sortKey]);

  const totals = useMemo(() => sumOutlets(scoped), [scoped]);

  const exportCsv = () => {
    const header = [
      "Branch", "Orders", "Total revenue", "Food revenue", "Room revenue",
      "Orders today", "Bookings", "Active bookings", "Rooms", "Tables",
    ];
    const lines = rows.map((o) =>
      [
        o.outlet_name, o.total_orders, toNumber(o.total_revenue), toNumber(o.food_revenue), roomRevenue(o),
        o.today_orders, o.total_bookings, o.active_bookings, o.total_rooms, o.total_tables,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "branch-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const actions = (
    <>
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} strokeWidth={1.75} aria-hidden />
        Refresh
      </Button>
      <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
        <Download className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        Export CSV
      </Button>
    </>
  );

  return (
    <AdminShell
      scope="admin"
      title="Analytics"
      description="Revenue, orders and bookings by branch. Refreshes every 30 seconds."
      actions={actions}
    >
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            title="Analytics could not be loaded"
            description="Check your connection and try again."
            action={<Button variant="outline" onClick={() => refetch()}>Try again</Button>}
          />
        ) : outlets.length === 0 ? (
          <EmptyState title="No branches yet" description="Add a branch to start collecting figures." />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total revenue" value={<Money value={totals.revenue} />} icon={IndianRupee} hint="Orders and room bookings" />
              <StatCard label="Food and beverage" value={<Money value={totals.food} />} icon={UtensilsCrossed} hint={`${totals.foodShare.toFixed(0)}% of revenue`} />
              <StatCard label="Rooms revenue" value={<Money value={totals.room} />} icon={BedDouble} hint={`${formatNumber(totals.rooms)} rooms, ${formatNumber(totals.tables)} tables`} />
              <StatCard label="Orders" value={formatNumber(totals.orders)} icon={ShoppingBag} hint={`${formatNumber(totals.today)} today`} />
              <StatCard label="Bookings" value={formatNumber(totals.bookings)} icon={CalendarCheck} hint={`${formatNumber(totals.active)} active`} />
            </div>

            <DataToolbar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search branch"
              filters={
                <>
                  <Select value={branch} onValueChange={setBranch}>
                    <SelectTrigger className="w-full sm:w-[200px]" aria-label="Branch">
                      <SelectValue placeholder="Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All branches</SelectItem>
                      {outlets.map((o) => (
                        <SelectItem key={o.outlet_id} value={o.outlet_id}>{o.outlet_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                    <SelectTrigger className="w-full sm:w-[170px]" aria-label="Sort by">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                        <SelectItem key={k} value={k}>Sort by {SORT_LABEL[k].toLowerCase()}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />

            {rows.length === 0 ? (
              <EmptyState title="No matching branches" description="Adjust the search or branch filter." />
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-2">
                  <ChartPanel title="Revenue by source" description="Food and beverage against room bookings, per branch.">
                    <RevenueSplitChart outlets={rows} />
                  </ChartPanel>
                  <ChartPanel title="Orders and bookings" description="Lifetime volume per branch.">
                    <ActivityChart outlets={rows} />
                  </ChartPanel>
                </div>

                <section className="rounded-md border border-border bg-card">
                  <div className="border-b border-border px-5 py-4">
                    <h2 className="text-lg">Branch figures</h2>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Food</TableHead>
                        <TableHead className="text-right">Rooms</TableHead>
                        <TableHead className="text-right">Today</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                        <TableHead className="text-right">Rooms</TableHead>
                        <TableHead className="text-right">Tables</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((o) => (
                        <TableRow key={o.outlet_id}>
                          <TableCell className="font-medium">{o.outlet_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.total_orders))}</TableCell>
                          <TableCell className="text-right"><Money value={toNumber(o.total_revenue)} /></TableCell>
                          <TableCell className="text-right"><Money value={toNumber(o.food_revenue)} /></TableCell>
                          <TableCell className="text-right"><Money value={roomRevenue(o)} /></TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.today_orders))}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.total_bookings))}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.active_bookings))}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.total_rooms))}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber(toNumber(o.total_tables))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              </>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
