"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { Loader2 } from "lucide-react";
import { formatDate, formatINR } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { Booking } from "./types";
import { useExtendStay, useExtensionOptions } from "./use-bookings";
import { bookingTotal, errorMessage } from "./utils";

const iso = (date: Date) => format(date, "yyyy-MM-dd");
const dayOf = (value: string | undefined) => (value ? value.slice(0, 10) : "");

type Props = { booking: Booking | null; open: boolean; onOpenChange: (open: boolean) => void };

/**
 * Keeps a checked-in guest for more nights, in the same room or others. The price list sets each room's rate for
 * the new nights; an administrator can change a rate, for example to give a discount.
 */
export function ExtendStayDialog({ booking, open, onOpenChange }: Props) {
  const currentOut = dayOf(booking?.check_out_date);
  const earliest = currentOut ? iso(addDays(new Date(`${currentOut}T00:00:00`), 1)) : "";
  const [newOut, setNewOut] = useState("");
  const [chosen, setChosen] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setNewOut(earliest);
      setChosen({});
    }
  }, [open, earliest]);

  const validDate = newOut && newOut >= earliest;
  const options = useExtensionOptions(open && booking && validDate ? booking.id : null, validDate ? newOut : null);
  const extend = useExtendStay(() => onOpenChange(false));
  const rooms = useMemo(() => options.data?.rooms ?? [], [options.data]);
  const canSetRate = Boolean(options.data?.canSetRate);
  const nights = options.data?.nights ?? 0;

  // When the dates change, offer the rooms the guest is already in, if they are free for the new nights.
  useEffect(() => {
    if (!options.data) return;
    setChosen(Object.fromEntries(options.data.rooms.filter((room) => room.currentRoom).map((room) => [room.id, String(room.rate)])));
  }, [options.data]);

  const toggle = (id: string, rate: number) =>
    setChosen((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = String(rate);
      return next;
    });

  const lines = rooms
    .filter((room) => room.id in chosen)
    .map((room) => {
      const rate = Number(chosen[room.id]);
      return { room, rate, valid: Number.isFinite(rate) && rate >= 0, amount: Math.round((Number.isFinite(rate) ? rate : 0) * nights * 100) / 100 };
    });
  const added = lines.reduce((sum, line) => sum + line.amount, 0);
  const ready = lines.length > 0 && lines.every((line) => line.valid) && !extend.isPending;

  const submit = () => {
    if (!booking) return;
    extend.mutate({
      id: booking.id,
      newCheckOut: newOut,
      rooms: lines.map(({ room, rate }) => ({ id: room.id, ...(canSetRate && Math.abs(rate - room.rate) > 0.009 ? { rate } : {}) })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !extend.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Extend stay{booking?.guest_name ? `: ${booking.guest_name}` : ""}</DialogTitle>
          <DialogDescription>
            Now leaving {formatDate(booking?.check_out_date)}. Choose the new check-out date and the room or rooms for the extra nights.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="extend-out">New check-out date</Label>
          <Input id="extend-out" type="date" className="w-44" min={earliest} value={newOut} onChange={(e) => setNewOut(e.target.value)} />
        </div>

        {!validDate ? (
          <p className="text-sm text-destructive">Choose a date after the current check-out.</p>
        ) : options.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : options.isError ? (
          <p role="alert" className="text-sm text-destructive">{errorMessage(options.error, "Could not load the rooms.")}</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rooms are free for all {nights} extra night{nights === 1 ? "" : "s"}. Try a shorter extension.</p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              Rooms free for {nights} extra night{nights === 1 ? "" : "s"} ({formatDate(options.data?.currentCheckOut)} to {formatDate(options.data?.newCheckOut)})
            </legend>
            <ul className="divide-y rounded-md border">
              {rooms.map((room) => {
                const on = room.id in chosen;
                const rate = Number(chosen[room.id]);
                return (
                  <li key={room.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <label className="flex min-w-0 items-center gap-3">
                      <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => toggle(room.id, room.rate)} />
                      <span className="min-w-0">
                        <span className="font-medium">Room {room.code}</span>
                        <span className="text-muted-foreground"> · {room.category}</span>
                        {room.currentRoom ? <span className="ml-2 rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground">Current room</span> : null}
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          Price list {formatINR(room.rate)} per night{room.level ? ` · Floor ${room.level}` : ""}
                        </span>
                      </span>
                    </label>
                    {on ? (
                      <span className="flex items-center gap-2">
                        {canSetRate ? (
                          <Input
                            aria-label={`Rate per night for room ${room.code}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="h-9 w-28 tabular-nums"
                            value={chosen[room.id]}
                            onChange={(e) => setChosen((prev) => ({ ...prev, [room.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="tabular-nums">{formatINR(room.rate)}</span>
                        )}
                        <span className="w-24 text-right tabular-nums text-muted-foreground">
                          {Number.isFinite(rate) ? formatINR(rate * nights) : "-"}
                        </span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canSetRate ? <p className="text-xs text-muted-foreground">As an administrator you can change a rate, for example to give a discount.</p> : null}
          </fieldset>
        )}

        {lines.length > 0 ? (
          <dl className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between"><dt>Added for {nights} night{nights === 1 ? "" : "s"} (before GST)</dt><dd className="tabular-nums">{formatINR(added)}</dd></div>
            <div className="flex justify-between text-muted-foreground"><dt>Room total after extension (before GST)</dt><dd className="tabular-nums">{formatINR(bookingTotal(booking as Booking) + added)}</dd></div>
            <p className="pt-1 text-xs text-muted-foreground">GST is worked out on the bill, room by room, at 12% up to ₹7,500 a night and 18% above.</p>
          </dl>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={extend.isPending}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!ready}>
            {extend.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
            Extend stay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
