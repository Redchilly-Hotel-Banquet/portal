"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Receipt, RefreshCw, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { EmptyState } from "@/components/admin/empty-state";
import { formatDateTime } from "@/components/admin/format";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiPost } from "@/lib/apiClient";
import { discardCart } from "../cart";
import { DiningHeading } from "../dining-heading";
import { stepFor } from "../order-progress";
import type { OrderRecord } from "../types";
import { useAccount } from "@/hooks/useAccount";
import { useGuestSession } from "../use-guest-session";
import { errorMessage, locationLabel, shortOrderId, toNumber } from "../utils";

export function MyOrdersView() {
  const router = useRouter();
  const { session, ready, clear } = useGuestSession();
  const account = useAccount();
  // Ending a stay is the front desk's job. Only a signed-out QR guest, who has no other way to clear a
  // shared phone, is offered a local reset.
  const canEndStay = account === null;
  const bookingId = session?.bookingId ?? null;
  const [confirmEnd, setConfirmEnd] = useState(false);

  const query = useQuery<{ orders: OrderRecord[] }>({
    queryKey: ["guest-orders", bookingId],
    enabled: Boolean(bookingId),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => apiPost<{ orders: OrderRecord[] }, { bookingId: string }>("/public/orders/guest", { bookingId: bookingId as string }),
  });
  const orders = query.data?.orders ?? [];

  const endStay = () => {
    if (session?.outletId) discardCart(session.outletId);
    clear();
    setConfirmEnd(false);
    toast.success("Your session has been cleared. We hope you enjoyed your stay.");
    router.replace("/");
  };

  if (!ready) {
    return (
      <>
        <DiningHeading eyebrow="Dining" title="My orders" />
        <div className="page-container space-y-4 py-10" aria-busy="true">
          <Skeleton className="h-24 w-full max-w-3xl" />
          <Skeleton className="h-24 w-full max-w-3xl" />
        </div>
      </>
    );
  }

  if (!session || !bookingId) {
    return (
      <>
        <DiningHeading eyebrow="Dining" title="My orders" />
        <div className="page-container py-10">
          <EmptyState
            icon={Receipt}
            title={session ? "Order history is available for room bookings" : "No active session"}
            description={
              session
                ? "Table orders are tracked from the confirmation page shown after you order."
                : "Scan the QR code in your room to order and see your orders here."
            }
            action={
              <Button asChild>
                <Link href="/qr">
                  <ScanLine strokeWidth={1.75} aria-hidden />
                  Scan QR code
                </Link>
              </Button>
            }
          />
        </div>
      </>
    );
  }

  return (
    <>
      <DiningHeading
        eyebrow="Dining"
        title="My orders"
        description={
          <>
            <span className="font-medium text-foreground">{locationLabel(session.type, session.code)}</span>
            {(session.outletName ?? session.outletId) && <> at {session.outletName ?? session.outletId}</>}
            {session.bookingCode && (
              <>
                . Booking <span className="font-mono text-foreground">{session.bookingCode}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw strokeWidth={1.75} className={query.isFetching ? "animate-spin" : undefined} aria-hidden />
              Refresh
            </Button>
            {canEndStay ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmEnd(true)}>
                End stay
              </Button>
            ) : null}
          </>
        }
      />

      <div className="page-container max-w-4xl py-10 md:py-14 lg:mx-auto">
        {session.bookingStatus === "CHECKED_OUT" && (
          <p className="mb-8 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            This booking has been checked out by our team. Your order history is shown for reference. New orders are not available.
          </p>
        )}

        {query.isLoading ? (
          <div className="space-y-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={Receipt}
            title="Orders could not be loaded"
            description={errorMessage(query.error, "Please try again in a moment.")}
            action={
              <Button type="button" variant="outline" onClick={() => query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No orders yet"
            description="Orders you place from the menu will appear here."
            action={
              <Button asChild>
                <Link href="/menu">Browse menu</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {orders.map((order) => (
              <li key={order.id} className="py-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-lg">Order #{shortOrderId(order.id)}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{formatDateTime(order.created_at)}</p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
                {stepFor(order.status)?.detail && <p className="mt-2 text-sm text-muted-foreground">{stepFor(order.status)?.detail}</p>}

                <ul className="mt-4 space-y-1.5 text-sm">
                  {(order.order_items ?? []).map((item, index) => (
                    <li key={item.id ?? index} className="flex justify-between gap-4">
                      <span>
                        <span className="tabular-nums">{item.quantity}</span> x {item.menu_items?.name ?? "Item"}
                        {item.notes && <span className="block text-xs text-muted-foreground">{item.notes}</span>}
                      </span>
                      <Money value={toNumber(item.price) * item.quantity} className="shrink-0" />
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <Money value={toNumber(order.total)} className="font-display text-lg" />
                  </div>
                  <div className="flex items-center gap-3">
                    {order.status === "ORDER_FINISHED" && <span className="text-xs text-muted-foreground">Ready for billing</span>}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/order-status/${order.id}`}>View status</Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEndStay ? (
      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="End your stay session?"
        description="This clears your room details and any unsent items from this device. Your order history stays with the hotel."
        confirmLabel="End stay"
        destructive
        onConfirm={endStay}
      />
      ) : null}
    </>
  );
}
