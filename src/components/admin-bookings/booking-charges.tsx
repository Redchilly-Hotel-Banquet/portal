"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatINR } from "@/components/admin/format";
import { Money } from "@/components/admin/money";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Booking, BillingSummary } from "./types";
import { useUpdateAmount } from "./use-bookings";
import { bookingTotal } from "./utils";

type Props = {
  booking: Booking;
  billing?: BillingSummary;
  loading: boolean;
  error: string | null;
};

function Row({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-sm ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BookingCharges({ booking, billing, loading, error }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const mutation = useUpdateAmount(() => setDraft(null));

  const save = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < 0) {
      toast.error("Enter a valid amount before saving.");
      return;
    }
    mutation.mutate({ id: booking.id, totalAmount: Number(parsed.toFixed(2)) });
  };

  return (
    <div className="space-y-4">
      <dl className="divide-y rounded-md border bg-card px-4">
        <Row label="Agreed room total">
          {draft === null ? (
            <span className="flex items-center gap-2">
              <Money value={bookingTotal(booking)} className="font-medium" />
              <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setDraft(bookingTotal(booking).toFixed(2))}
                  aria-label="Edit agreed room total"
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Button>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className="h-9 w-28"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setDraft(null);
                }}
                disabled={mutation.isPending}
                aria-label="Agreed room total in INR"
                autoFocus
              />
              <Button size="sm" onClick={save} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={mutation.isPending}>
                Cancel
              </Button>
            </span>
          )}
        </Row>
      </dl>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : loading || !billing ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <>
          <dl className="divide-y rounded-md border bg-card px-4">
            <Row label="Room charges">
              <Money value={billing.roomTotal} />
            </Row>
            <Row label="Food and beverages">
              <Money value={billing.foodTotal} />
            </Row>
            <Row label="Folio total" strong>
              <Money value={billing.grandTotal} />
            </Row>
          </dl>

          <div>
            <h4 className="eyebrow mb-2">In-room orders</h4>
            {billing.orders.length ? (
              <ul className="divide-y rounded-md border bg-card text-sm">
                {billing.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium">Order {order.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={order.status} />
                      <span className="tabular-nums">{formatINR(Number(order.total ?? 0))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No in-room orders logged.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
