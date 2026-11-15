"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { formatINR } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Booking, ExtraCharge } from "./types";
import { useExtraCharge } from "./use-bookings";

type Props = { booking: Booking | null; charges: ExtraCharge[]; open: boolean; onOpenChange: (open: boolean) => void };

/** Adds breakage, damages or anything else to the bill before check-out. These are added as they are, without GST. */
export function ExtraChargeDialog({ booking, charges, open, onOpenChange }: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const add = useExtraCharge(() => {
    setDescription("");
    setAmount("");
  });
  const remove = useExtraCharge();
  const busy = add.isPending || remove.isPending;

  useEffect(() => {
    if (open) {
      setDescription("");
      setAmount("");
    }
  }, [open]);

  const value = Number(amount);
  const ready = Boolean(booking && description.trim() && Number.isFinite(value) && value > 0) && !busy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!booking || !ready) return;
    add.mutate({ id: booking.id, action: "add_extra_charge", description: description.trim(), amount: value });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add extra charges{booking?.guest_name ? `: ${booking.guest_name}` : ""}</DialogTitle>
          <DialogDescription>For anything broken or damaged in the room, or any other extra. It is added to the bill before check-out, without GST.</DialogDescription>
        </DialogHeader>

        {charges.length > 0 ? (
          <ul className="divide-y rounded-md border bg-card text-sm">
            {charges.map((charge) => (
              <li key={charge.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0 break-words">{charge.description}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">{formatINR(charge.amount)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${charge.description}`}
                    disabled={busy || !booking}
                    onClick={() => booking && remove.mutate({ id: booking.id, action: "remove_extra_charge", chargeId: charge.id })}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="extra-description">What for</Label>
            <Input id="extra-description" value={description} maxLength={120} placeholder="Broken glass, damaged towel, extra bed" onChange={(e) => setDescription(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="extra-amount">Amount (INR)</Label>
            <Input id="extra-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Done
            </Button>
            <Button type="submit" disabled={!ready}>
              {add.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Add charge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
