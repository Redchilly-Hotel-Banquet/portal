"use client";

import { getAdminOutlets, hasOutletAccess } from "@/hooks/useAdminAccess";
import { useMemo, useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Button } from "@/components/ui/button";
import { BookingDetailSheet } from "./booking-detail-sheet";
import { BookingFilters, INITIAL_FILTERS, type BookingFilterState } from "./booking-filters";
import { BookingsTable } from "./bookings-table";
import { CheckinDialog } from "./checkin-dialog";
import { CreateBookingDialog } from "./create-booking-dialog";
import { InvoiceDialog } from "./invoice-dialog";
import type { BillingSummary, Booking } from "./types";
import { useBookingsQuery, useOutletsQuery } from "./use-bookings";
import { errorMessage, overlapsRange, searchHaystack } from "./utils";

export function BookingsConsole() {
  const bookingsQuery = useBookingsQuery();
  const outletsQuery = useOutletsQuery();
  const [filters, setFilters] = useState<BookingFilterState>(INITIAL_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkinTarget, setCheckinTarget] = useState<Booking | null>(null);
  const [invoice, setInvoice] = useState<BillingSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const bookings = bookingsQuery.data?.bookings;
  // Staff assigned to some branches can only make bookings in those.
  const allowedOutlets = getAdminOutlets();
  const outlets = (outletsQuery.data ?? []).filter((outlet) => hasOutletAccess(allowedOutlets, outlet.location_key));

  // Everything except the status tab, so tab counts reflect the other active filters.
  const scoped = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return (bookings ?? []).filter(
      (b) =>
        (filters.outlet === "all" || b.outlet_id === filters.outlet) &&
        overlapsRange(b, filters.from, filters.to) &&
        (!q || searchHaystack(b).includes(q)),
    );
  }, [bookings, filters.outlet, filters.search, filters.from, filters.to]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: scoped.length };
    for (const b of scoped) result[b.status] = (result[b.status] ?? 0) + 1;
    return result;
  }, [scoped]);

  const visible = useMemo(
    () => (filters.status === "all" ? scoped : scoped.filter((b) => b.status === filters.status)),
    [scoped, filters.status],
  );

  const selected = useMemo(() => (bookings ?? []).find((b) => b.id === selectedId) ?? null, [bookings, selectedId]);

  return (
    <AdminShell
      scope={["admin", "rooms"]}
      title="Reservations"
      description="Bookings across branches. Select a row for guest, stay, charges and actions."
      actions={
        <>
          <Button
            variant="outline"
            onClick={() => bookingsQuery.refetch()}
            disabled={bookingsQuery.isFetching}
            aria-label="Refresh reservations"
          >
            <RefreshCw className={`h-4 w-4 ${bookingsQuery.isFetching ? "animate-spin" : ""}`} strokeWidth={1.75} aria-hidden />
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            New reservation
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <BookingFilters filters={filters} onChange={setFilters} outlets={outlets} counts={counts} />

        {bookingsQuery.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span>{errorMessage(bookingsQuery.error, "Unable to load reservations.")}</span>
            <Button size="sm" variant="outline" onClick={() => bookingsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}

        <BookingsTable
          bookings={visible}
          loading={bookingsQuery.isLoading}
          selectedId={selectedId}
          onSelect={(b) => setSelectedId(b.id)}
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          Showing {visible.length} of {bookings?.length ?? 0} reservations. Refreshes every 10 seconds.
        </p>
      </div>

      <BookingDetailSheet
        booking={selected}
        welcome={bookingsQuery.data?.welcome}
        roomLevels={bookingsQuery.data?.room_levels}
        onClose={() => setSelectedId(null)}
        onManageCheckin={setCheckinTarget}
        onOpenInvoice={setInvoice}
      />
      <CheckinDialog booking={checkinTarget} onClose={() => setCheckinTarget(null)} />
      <InvoiceDialog summary={invoice} open={invoice !== null} onOpenChange={(open) => !open && setInvoice(null)} />
      <CreateBookingDialog open={createOpen} onOpenChange={setCreateOpen} outlets={outlets} defaultOutlet={filters.outlet} />
    </AdminShell>
  );
}
