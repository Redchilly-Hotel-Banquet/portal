"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Inbox, RefreshCw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/admin/empty-state";
import { DataToolbar } from "@/components/admin/data-toolbar";
import { statusLabel } from "@/components/admin/status-badge";
import { ApiError, apiPost } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { AlarmDialog } from "./alarm-dialog";
import { OrderCard } from "./order-card";
import { useOrderAlarm } from "./use-order-alarm";
import {
  ACTIVE_STATUSES,
  ALARM_SRC,
  ORDER_STATUSES,
  PAGE_SIZE,
  POLL_MS,
  locationKey,
  type AdminOrder,
  type OrderStatus,
  type SortKey,
} from "./types";

const ALL = "ALL";

const sortedUnique = (values: Iterable<string>) =>
  Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

export function OrdersConsole() {
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => apiPost<AdminOrder[]>("/admin/orders/manage", { action: "list" }, true),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });
  const orders = data;

  const alarm = useOrderAlarm(orders, audioRef);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => setNow(Date.now()), [orders]);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      apiPost("/admin/orders/manage", { action: "update_status", id, status }, true),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success(`Order moved to ${statusLabel(vars.status)}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to update order status"),
  });

  const [statusFilter, setStatusFilter] = useState<Set<OrderStatus>>(() => new Set(ACTIVE_STATUSES));
  const [outletFilter, setOutletFilter] = useState(ALL);
  const [tableFilter, setTableFilter] = useState(ALL);
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [sortBy, setSortBy] = useState<SortKey>("NEWEST");
  const [page, setPage] = useState(1);

  const outletScoped = useMemo(
    () => (orders ?? []).filter((o) => outletFilter === ALL || o.outlet_id === outletFilter),
    [orders, outletFilter],
  );

  const outlets = useMemo(() => sortedUnique((orders ?? []).map((o) => o.outlet_id)), [orders]);
  const tables = useMemo(
    () => sortedUnique(outletScoped.map((o) => o.rooms_tables?.code).filter((c): c is string => Boolean(c))),
    [outletScoped],
  );
  const categories = useMemo(
    () =>
      sortedUnique(
        outletScoped.flatMap((o) =>
          (o.order_items ?? []).map((it) => it.menu_items?.category).filter((c): c is string => Boolean(c)),
        ),
      ),
    [outletScoped],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    outletScoped.forEach((o) => {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    });
    return counts;
  }, [outletScoped]);

  const repeatKeys = useMemo(() => {
    const m = new Map<string, number>();
    outletScoped.forEach((o) => m.set(locationKey(o), (m.get(locationKey(o)) ?? 0) + 1));
    return new Set(Array.from(m).filter(([, n]) => n > 1).map(([k]) => k));
  }, [outletScoped]);

  const filtered = useMemo(() => {
    const time = (o: AdminOrder) => new Date(o.created_at).getTime();
    const arr = outletScoped.filter(
      (o) =>
        (statusFilter.size === 0 || statusFilter.has(o.status as OrderStatus)) &&
        (tableFilter === ALL || o.rooms_tables?.code === tableFilter) &&
        (categoryFilter === ALL || (o.order_items ?? []).some((it) => it.menu_items?.category === categoryFilter)),
    );
    const isRepeat = (o: AdminOrder) => repeatKeys.has(locationKey(o));
    return arr.sort((a, b) => {
      if (sortBy === "OLDEST") return time(a) - time(b);
      if (sortBy === "REPEAT_FIRST" && isRepeat(a) !== isRepeat(b)) return isRepeat(a) ? -1 : 1;
      return time(b) - time(a);
    });
  }, [outletScoped, statusFilter, tableFilter, categoryFilter, sortBy, repeatKeys]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const start = filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE;
  const end = Math.min(filtered.length, start + PAGE_SIZE);
  const visible = filtered.slice(start, end);

  useEffect(() => setPage((p) => Math.min(p, totalPages)), [totalPages]);

  const toggleStatus = (s: OrderStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
    setPage(1);
  };

  const reset = () => {
    setStatusFilter(new Set(ACTIVE_STATUSES));
    setOutletFilter(ALL);
    setTableFilter(ALL);
    setCategoryFilter(ALL);
    setSortBy("NEWEST");
    setPage(1);
  };

  const filtersActive =
    outletFilter !== ALL ||
    tableFilter !== ALL ||
    categoryFilter !== ALL ||
    sortBy !== "NEWEST" ||
    statusFilter.size !== ACTIVE_STATUSES.length ||
    ACTIVE_STATUSES.some((s) => !statusFilter.has(s));

  const withReset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <AdminShell
      scope={["admin", "kitchen"]}
      title="Orders"
      description="Today's orders, refreshed every 10 seconds."
      actions={
        <>
          {alarm.audioEnabled ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <Volume2 className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Sound alerts on
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={alarm.enableSound}>
              <BellOff aria-hidden strokeWidth={1.75} /> Enable sound alerts
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh orders">
            <RefreshCw className={cn(isFetching && "motion-safe:animate-spin")} aria-hidden strokeWidth={1.75} />
          </Button>
        </>
      }
    >
      <audio ref={audioRef} src={ALARM_SRC} preload="auto" loop hidden />

      <AlarmDialog
        open={alarm.alarmOpen}
        orderIds={alarm.pendingIds}
        audioEnabled={alarm.audioEnabled}
        onEnableSound={alarm.enableSound}
        onAcknowledge={alarm.acknowledge}
      />

      <div className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {ORDER_STATUSES.map((s) => {
            const on = statusFilter.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStatus(s)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {statusLabel(s)}
                <span className="tabular-nums text-xs opacity-80">{statusCounts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <DataToolbar
          filters={
            <>
              <Select value={outletFilter} onValueChange={withReset(setOutletFilter)}>
                <SelectTrigger className="w-40" aria-label="Outlet"><SelectValue placeholder="Outlet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All outlets</SelectItem>
                  {outlets.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={tableFilter} onValueChange={withReset(setTableFilter)}>
                <SelectTrigger className="w-40" aria-label="Table or room"><SelectValue placeholder="Table or room" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All tables and rooms</SelectItem>
                  {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={withReset(setCategoryFilter)}>
                <SelectTrigger className="w-40" aria-label="Category"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={withReset((v: string) => setSortBy(v as SortKey))}>
                <SelectTrigger className="w-44" aria-label="Sort"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEWEST">Newest first</SelectItem>
                  <SelectItem value="OLDEST">Oldest first</SelectItem>
                  <SelectItem value="REPEAT_FIRST">Repeat orders first</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={
            <Button size="sm" variant="ghost" onClick={reset} disabled={!filtersActive}>
              Reset filters
            </Button>
          }
        />

        {isError ? (
          <EmptyState
            icon={Inbox}
            title="Orders could not be loaded"
            description={error instanceof ApiError ? error.message : "Check your connection and try again."}
            action={<Button variant="outline" onClick={() => void refetch()}>Retry</Button>}
          />
        ) : isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={orders && orders.length > 0 ? "No orders match these filters" : "No orders today"}
            description={
              orders && orders.length > 0
                ? "Adjust the status or location filters to see more."
                : "New orders appear here as soon as guests place them."
            }
          />
        ) : (
          <>
            <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              Showing {start + 1}–{end} of {filtered.length}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {visible.map((order) => (
                <OrderCard
                  key={order._id}
                  order={order}
                  isRepeat={repeatKeys.has(locationKey(order))}
                  now={now}
                  busy={mutation.isPending && mutation.variables?.id === order._id}
                  onStatusChange={(id, status) => mutation.mutate({ id, status })}
                />
              ))}
            </div>
            {filtered.length > PAGE_SIZE ? (
              <nav className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm" aria-label="Pagination">
                <Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>
                  Previous
                </Button>
                <span className="tabular-nums text-muted-foreground">Page {current} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={current === totalPages} onClick={() => setPage(current + 1)}>
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </AdminShell>
  );
}
