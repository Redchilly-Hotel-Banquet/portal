"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { formatINR } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYMENT_MODES } from "@/lib/payment-modes";
import { GstBreakdown } from "./gst-breakdown";
import type { BillingSummary } from "./types";

type Row = { key: number; mode: string; amount: string; reference: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guestName?: string;
  billing: BillingSummary | undefined;
  loading: boolean;
  submitting: boolean;
  onConfirm: (payments: Array<{ mode: string; amount: number; reference: string }>) => void;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

let counter = 0;
const blank = (amount = ""): Row => ({ key: ++counter, mode: "", amount, reference: "" });

/** Final bill with GST, and how the guest paid. The amounts have to add up to the total before checkout is allowed. */
export function CheckoutDialog({ open, onOpenChange, guestName, billing, loading, submitting, onConfirm }: Props) {
  const total = billing?.grandTotal ?? 0;
  const [rows, setRows] = useState<Row[]>([blank()]);

  useEffect(() => {
    if (open) setRows([blank(total ? total.toFixed(2) : "")]);
    // Start again each time the dialog opens, not when the bill refreshes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fill the first row once the bill arrives, if the receptionist has not typed anything yet.
  useEffect(() => {
    if (open && total > 0) setRows((prev) => (prev.length === 1 && !prev[0].amount ? [{ ...prev[0], amount: total.toFixed(2) }] : prev));
  }, [open, total]);

  const paid = Math.round(rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100) / 100;
  const difference = Math.round((total - paid) * 100) / 100;
  const complete = rows.every((row) => row.mode && Number(row.amount) > 0);
  const ready = Boolean(billing) && complete && difference === 0 && !submitting;

  const update = (key: number, patch: Partial<Row>) => setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check out{guestName ? ` ${guestName}` : ""}</DialogTitle>
          <DialogDescription>Confirm the bill, then record how the guest paid. This finalises the folio.</DialogDescription>
        </DialogHeader>

        {loading || !billing ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <GstBreakdown gst={billing.gst} />
        )}

        <fieldset className="space-y-3" disabled={submitting}>
          <legend className="text-sm font-medium">Payment received</legend>
          {rows.map((row, index) => (
            <div key={row.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor={`pay-mode-${row.key}`} className="text-xs">Source</Label>
                <select id={`pay-mode-${row.key}`} className={selectClass} value={row.mode} onChange={(e) => update(row.key, { mode: e.target.value })}>
                  <option value="">Select source</option>
                  {PAYMENT_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`pay-amount-${row.key}`} className="text-xs">Amount</Label>
                <Input
                  id={`pay-amount-${row.key}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="tabular-nums"
                  value={row.amount}
                  onChange={(e) => update(row.key, { amount: e.target.value })}
                />
              </div>
              {rows.length > 1 ? (
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove payment ${index + 1}`} onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Button>
              ) : (
                <span />
              )}
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor={`pay-ref-${row.key}`} className="text-xs">Reference (optional)</Label>
                <Input id={`pay-ref-${row.key}`} maxLength={80} placeholder="UPI transaction ID, card last 4, cheque number" value={row.reference} onChange={(e) => update(row.key, { reference: e.target.value })} autoComplete="off" />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...prev, blank(difference > 0 ? difference.toFixed(2) : "")])}
            >
              <Plus className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
              Split payment
            </Button>
            <p className={`text-sm tabular-nums ${difference === 0 ? "text-success" : "text-destructive"}`} aria-live="polite">
              {difference === 0
                ? `Received ${formatINR(paid)}`
                : difference > 0
                  ? `${formatINR(difference)} still to be received`
                  : `${formatINR(Math.abs(difference))} more than the total`}
            </p>
          </div>
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready}
            onClick={() => onConfirm(rows.map((row) => ({ mode: row.mode, amount: Number(row.amount), reference: row.reference.trim() })))}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Check out and finalise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
