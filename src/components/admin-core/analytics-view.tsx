"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Camera, CalendarCheck, IndianRupee, RefreshCw, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { StatCard } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/admin/empty-state";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { Money } from "@/components/admin/money";
import { formatNumber } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiPost } from "@/lib/apiClient";
import { getAdminUser } from "@/lib/authSession";
import {
  ANALYTICS_QUERY_KEY,
  roomRevenue,
  sumOutlets,
  toNumber,
  type OutletAnalytics,
  type SortKey,
} from "./analytics-types";
import { ActivityChart } from "./revenue-charts";
import { PieBreakdown } from "./chart-parts";
import { formatINR } from "@/components/admin/format";
import { BranchFilter } from "./branch-filter";
import { ExportMenu } from "./export-menu";
import { defaultRange, type Range } from "./range-picker";
import { ReportsPanel } from "./reports-panel";
import { downloadScreenshot } from "@/lib/screenshot";
import { toast } from "sonner";
import { GuestsTab } from "./guests-tab";
import { TrendsTab } from "./trends-tab";
import { PaymentSources } from "./payment-sources";
import { PeriodPicker, defaultPeriod, periodLabel, type Period } from "./period-picker";

const TAB_TITLE: Record<string, string> = { branches: "Branch analytics", guests: "Guest analytics", trends: "Trends" };

const SORT_LABEL: Record<SortKey, string> = {
  revenue: "Revenue",
  orders: "Orders",
  bookings: "Bookings",
  name: "Name",
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
  const [branches, setBranches] = useState<string[]>([]);
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [tab, setTab] = useState("branches");
  const [guestsRange, setGuestsRange] = useState<Range>(defaultRange);
  const [trendsRange, setTrendsRange] = useState<Range>(defaultRange);
  const user = getAdminUser()?.name ?? "";
  const exportRange = tab === "guests" ? guestsRange : tab === "trends" ? trendsRange : period;
  const captureRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);

  const screenshot = async () => {
    if (!captureRef.current) return;
    setCapturing(true);
    try {
      // The details block is only drawn while capturing; wait for it to be on screen before taking the picture.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await downloadScreenshot(captureRef.current, `analytics-${tab}-${new Date().toISOString().slice(0, 10)}.png`);
    } catch {
      toast.error("Could not capture the page");
    } finally {
      setCapturing(false);
    }
  };

  const { data: outlets = [], isLoading, isError, isFetching, refetch } = useQuery<OutletAnalytics[]>({
    queryKey: [...ANALYTICS_QUERY_KEY, "period", period.from, period.to],
    queryFn: async () => {
      const res = await apiPost<{ outlets: OutletAnalytics[] }>("/admin/analytics/outlets", period, true);
      return res?.outlets ?? [];
    },
    refetchInterval: 30000,
    placeholderData: (previous) => previous,
  });

  const scoped = useMemo(
    () => (branches.length === 0 ? outlets : outlets.filter((o) => branches.includes(o.outlet_id))),
    [outlets, branches],
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

  const branchOptions = useMemo(() => outlets.map((o) => ({ id: o.outlet_id, name: o.outlet_name })), [outlets]);

  const branchSummary = useMemo(() => {
    const chosen = branches.length === 0 ? branchOptions : branchOptions.filter((o) => branches.includes(o.id));
    return `${branches.length === 0 ? "All branches" : "Selected"} (${chosen.length}): ${chosen.map((o) => o.name).join(", ") || "none"}`;
  }, [branches, branchOptions]);

  const totals = useMemo(() => sumOutlets(scoped), [scoped]);

  const actions = (
    <>
      {tab === "branches" ? (
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`} strokeWidth={1.75} aria-hidden />
            Refresh
          </Button>
        </>
      ) : null}
      <ExportMenu kind={tab as "branches" | "guests" | "trends"} from={exportRange.from} to={exportRange.to} outlets={branches} />
      <Button variant="outline" size="sm" onClick={() => void screenshot()} disabled={capturing}>
        <Camera className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
        {capturing ? "Capturing" : "Screenshot"}
      </Button>
    </>
  );

  return (
    <AdminShell
      scope="admin"
      title="Analytics"
      description={`Revenue, orders and bookings by branch for ${periodLabel(period)}. Refreshes every 30 seconds.`}
      actions={actions}
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="guests">Guests</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>
          <BranchFilter options={branchOptions} selected={branches} onChange={setBranches} />
        </div>
        <ReportsPanel kind={tab as "branches" | "guests" | "trends"} from={exportRange.from} to={exportRange.to} outlets={branches} />
        <div ref={captureRef} className="space-y-6 bg-background">
          {capturing ? (
            <header className="rounded-md border border-border bg-card p-4">
              <p className="eyebrow">Red Chilly · Analytics</p>
              <h2 className="mt-1 font-display text-2xl">{TAB_TITLE[tab] ?? "Analytics"}</h2>
              <dl className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Period</dt>
                <dd>{periodLabel(exportRange)}</dd>
                <dt className="text-muted-foreground">Branches</dt>
                <dd>{branchSummary}</dd>
                {tab === "branches" && search.trim() ? (
                  <>
                    <dt className="text-muted-foreground">Search</dt>
                    <dd>{search.trim()}</dd>
                  </>
                ) : null}
                {tab === "branches" ? (
                  <>
                    <dt className="text-muted-foreground">Sorted by</dt>
                    <dd>{SORT_LABEL[sortKey]}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Captured</dt>
                <dd>{new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}{user ? ` by ${user}` : ""}</dd>
              </dl>
            </header>
          ) : null}
        <TabsContent value="guests" className="mt-0"><GuestsTab outlets={branches} range={guestsRange} onRangeChange={setGuestsRange} /></TabsContent>
        <TabsContent value="trends" className="mt-0"><TrendsTab outlets={branches} range={trendsRange} onRangeChange={setTrendsRange} /></TabsContent>
        <TabsContent value="branches" className="mt-0">
      <div className="space-y-6">
        <PeriodPicker value={period} onChange={setPeriod} />
        <p className="-mt-3 text-xs text-muted-foreground">
          Orders and bookings are those created in the period; payments are those received in it. Active stays, rooms and tables are as of now.
        </p>
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
              <EmptyState title="No matching branches" description="Adjust the search or the branch filter." />
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-2">
                  <ChartPanel title="Revenue by source" description="Food and beverage against room bookings, for the branches shown.">
                    <PieBreakdown
                      label="Pie chart of food and room revenue"
                      format={formatINR}
                      slices={[
                        { name: "Food and beverage", value: rows.reduce((sum, o) => sum + toNumber(o.food_revenue), 0) },
                        { name: "Rooms", value: rows.reduce((sum, o) => sum + roomRevenue(o), 0) },
                      ]}
                    />
                  </ChartPanel>
                  <ChartPanel title="Orders and bookings" description="Volume per branch in the chosen period.">
                    <ActivityChart outlets={rows} />
                  </ChartPanel>
                </div>

                <PaymentSources outlets={rows} />

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
        </TabsContent>
        </div>
      </Tabs>
    </AdminShell>
  );
}
