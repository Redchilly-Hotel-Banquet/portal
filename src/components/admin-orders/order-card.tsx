"use client";

import { Clock, Phone, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, statusLabel } from "@/components/admin/status-badge";
import { Money } from "@/components/admin/money";
import { formatDateTime } from "@/components/admin/format";
import { cn } from "@/lib/utils";
import {
  NEXT_STEP,
  ORDER_STATUSES,
  locationLabel,
  shortId,
  type AdminOrder,
  type OrderStatus,
} from "./types";

type OrderCardProps = {
  order: AdminOrder;
  isRepeat: boolean;
  now: number;
  busy: boolean;
  onStatusChange: (id: string, status: OrderStatus) => void;
};

const elapsedMinutes = (createdAt: string, now: number) => {
  const t = new Date(createdAt).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
};

const formatElapsed = (mins: number) =>
  mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")} min`;

export function OrderCard({ order, isRepeat, now, busy, onStatusChange }: OrderCardProps) {
  const status = order.status as OrderStatus;
  const next = NEXT_STEP[status];
  const active = status !== "DELIVERED";
  const mins = elapsedMinutes(order.created_at, now);
  const late = active && mins >= 30;
  const slow = active && mins >= 15;

  return (
    <article
      className={cn(
        "flex flex-col rounded-md border bg-card",
        status === "PENDING" ? "border-warning/50" : "border-border",
      )}
      aria-label={`Order ${shortId(order._id)}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-sm font-semibold tabular-nums tracking-wide">#{shortId(order._id)}</h3>
            {order.source === "PHONE" ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden /> Phone
              </span>
            ) : null}
            {isRepeat ? (
              <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Repeat2 className="h-3 w-3" strokeWidth={1.75} aria-hidden /> Repeat
              </span>
            ) : null}
          </div>
          <p className="text-sm capitalize text-foreground">{locationLabel(order)}</p>
          <p className="text-xs text-muted-foreground">
            {order.outlet_id} · {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={order.status} />
          {active ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs tabular-nums",
                late ? "font-medium text-destructive" : slow ? "text-warning" : "text-muted-foreground",
              )}
              title="Time since the order was placed"
            >
              <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              {formatElapsed(mins)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex-1 space-y-3 px-4 py-3">
        <ul className="space-y-1.5 text-sm">
          {order.order_items?.map((item, idx) => (
            <li key={idx} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="tabular-nums text-muted-foreground">{item.quantity} ×</span>{" "}
                {item.menu_items?.name ?? "Unavailable item"}
                {item.menu_items?.category ? (
                  <span className="text-muted-foreground"> · {item.menu_items.category}</span>
                ) : null}
                {item.notes ? <span className="block text-xs text-muted-foreground">Note: {item.notes}</span> : null}
              </span>
              <Money value={Number(item.price) * item.quantity} className="shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>

        {order.special_instructions ? (
          <div className="rounded-sm border-l-2 border-brass bg-muted px-3 py-2">
            <p className="eyebrow">Special instructions</p>
            <p className="mt-1 text-sm">{order.special_instructions}</p>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Total </span>
          <Money value={order.total} className="font-semibold" />
        </p>
        <div className="flex items-center gap-2">
          <Select value={order.status} onValueChange={(v) => onStatusChange(order._id, v as OrderStatus)} disabled={busy}>
            <SelectTrigger className="h-9 w-32" aria-label={`Set status for order ${shortId(order._id)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {next ? (
            <Button size="sm" disabled={busy} onClick={() => onStatusChange(order._id, next.status)}>
              {next.label}
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
