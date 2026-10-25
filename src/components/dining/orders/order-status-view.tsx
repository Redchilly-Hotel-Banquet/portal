"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { apiPost } from "@/lib/apiClient";
import { DiningHeading } from "../dining-heading";
import { OrderProgress, isOrderDelivered, stepFor, stepIndex } from "../order-progress";
import type { OrderRecord } from "../types";
import { useGuestSession } from "../use-guest-session";
import { errorMessage, locationLabel, shortOrderId, toNumber } from "../utils";

const POLL_MS = 5000;

export function OrderStatusView() {
  const params = useParams<{ orderId: string }>();
  const orderId = Array.isArray(params?.orderId) ? params.orderId[0] : params?.orderId;
  const { session, ready } = useGuestSession();
  const bookingId = session?.bookingId ?? null;

  const query = useQuery<OrderRecord>({
    queryKey: ["order", orderId, bookingId],
    enabled: Boolean(orderId) && ready,
    queryFn: () => apiPost<OrderRecord, { orderId?: string; bookingId: string | null; checkinId?: string }>("/public/orders/detail", { orderId, bookingId, checkinId: session?.checkinId }, "user"),
    refetchInterval: (q) => (isOrderDelivered(q.state.data?.status) ? false : POLL_MS),
    refetchOnWindowFocus: false,
  });

  const order = query.data;

  if (!ready || query.isLoading) {
    return (
      <>
        <DiningHeading eyebrow="Order" title="Order status" />
        <div className="page-container space-y-4 py-10" aria-busy="true">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-40 w-full max-w-xl" />
        </div>
      </>
    );
  }

  if (query.isError || !order) {
    return (
      <>
        <DiningHeading eyebrow="Order" title="Order status" />
        <div className="page-container py-10">
          <EmptyState
            icon={SearchX}
            title="We could not load this order"
            description={errorMessage(query.error, "Please check the link and try again.")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => query.refetch()}>
                  Try again
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/">Back to home</Link>
                </Button>
              </div>
            }
          />
        </div>
      </>
    );
  }

  const current = stepFor(order.status);
  const finished = isOrderDelivered(order.status);
  const known = stepIndex(order.status) >= 0;
  const place = locationLabel(order.rooms_tables?.type, order.rooms_tables?.code);
  const lines = order.order_items ?? [];

  return (
    <>
      <DiningHeading
        eyebrow={`Order #${shortOrderId(order.id)}`}
        title={current?.label ?? "Order status"}
        description={
          <>
            {place && <span className="font-medium text-foreground">{place}. </span>}
            {finished
              ? "Thank you for your order. We hope you enjoyed your meal."
              : known
                ? "This page updates automatically while your order is being prepared."
                : "Please check with our team for the latest on this order."}
          </>
        }
        actions={
          <>
            <StatusBadge status={order.status} />
            <Button type="button" variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              <RefreshCw strokeWidth={1.75} className={query.isFetching ? "animate-spin" : undefined} aria-hidden />
              Refresh
            </Button>
          </>
        }
      />

      <div className="page-container grid gap-12 py-10 md:py-14 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20">
        {known && (
          <section aria-labelledby="progress-title">
            <h2 id="progress-title" className="mb-6 text-2xl tracking-tight">
              Progress
            </h2>
            <OrderProgress status={order.status} />
          </section>
        )}

        <section aria-labelledby="details-title" className={known ? undefined : "lg:col-span-2"}>
          <h2 id="details-title" className="text-2xl tracking-tight">
            Order details
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {lines.map((item, index) => (
              <li key={item.id ?? index} className="flex items-start justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p>
                    <span className="tabular-nums">{item.quantity}</span> x {item.menu_items?.name ?? "Item"}
                  </p>
                  {item.notes && <p className="mt-0.5 text-xs text-muted-foreground">{item.notes}</p>}
                </div>
                <Money value={toNumber(item.price) * item.quantity} className="shrink-0" />
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-sm font-medium">Total</span>
            <Money value={toNumber(order.total)} className="font-display text-2xl" />
          </div>
          {order.special_instructions && (
            <div className="mt-6 rounded-lg border border-border bg-surface p-4">
              <p className="eyebrow">Instructions</p>
              <p className="mt-2 text-sm text-muted-foreground">{order.special_instructions}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            {finished && (
              <Button asChild>
                <Link href="/menu">Order more</Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/my-orders">My orders</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
