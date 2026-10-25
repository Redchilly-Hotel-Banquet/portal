"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatINR } from "@/components/admin/format";
import { QtyStepper } from "@/components/dining/qty-stepper";
import { buildSections, filterItems } from "@/components/dining/menu/menu-sections";
import type { MenuResponse } from "@/components/dining/types";
import { ApiError, apiPost } from "@/lib/apiClient";

export type PhoneOrderStay = {
  bookingId: string;
  bookingCode?: string;
  guestName: string;
  outletId: string;
  rooms: Array<{ id: string; code: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the guest is already known (from a booking), the stay picker is skipped. */
  stay?: PhoneOrderStay | null;
  /** Starting value of "Already delivered". Reception adds food that has been served; the kitchen adds food to prepare. */
  defaultDelivered?: boolean;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";

/** Adds food a guest ordered by phone to their booking, so the kitchen sees it and the invoice counts it. */
export function PhoneOrderDialog({ open, onOpenChange, stay: presetStay, defaultDelivered = false }: Props) {
  const queryClient = useQueryClient();
  const [bookingId, setBookingId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [delivered, setDelivered] = useState(defaultDelivered);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const staysQuery = useQuery({
    queryKey: ["phone-order-stays"],
    queryFn: () => apiPost<{ stays: PhoneOrderStay[] }>("/admin/orders/phone", { action: "stays" }, true),
    enabled: open && !presetStay,
  });
  const stays = presetStay ? [presetStay] : (staysQuery.data?.stays ?? []);
  const stay = presetStay ?? stays.find((entry) => entry.bookingId === bookingId) ?? null;

  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setSearch("");
    setNote("");
    setDelivered(defaultDelivered);
    setBookingId(presetStay?.bookingId ?? "");
    setRoomId(presetStay?.rooms[0]?.id ?? "");
    // Reset when the dialog opens or the guest changes, not on every render of a parent that rebuilds `stay`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetStay?.bookingId]);

  const menuQuery = useQuery({
    queryKey: ["phone-order-menu", stay?.outletId],
    queryFn: () => apiPost<MenuResponse>("/public/menu/query", { outletId: stay?.outletId }),
    enabled: open && Boolean(stay?.outletId),
    staleTime: 60_000,
  });
  const items = useMemo(
    () => (menuQuery.data?.items ?? []).filter((item) => item.is_available !== false),
    [menuQuery.data],
  );
  const sections = useMemo(
    () => buildSections(filterItems(items, search, "all"), menuQuery.data?.categories ?? []),
    [items, search, menuQuery.data],
  );

  const chosen = items.filter((item) => (quantities[item.id] ?? 0) > 0);
  const total = chosen.reduce((sum, item) => sum + Number(item.price ?? 0) * (quantities[item.id] ?? 0), 0);
  const setQty = (id: string, delta: number) =>
    setQuantities((prev) => {
      const next = Math.min(Math.max((prev[id] ?? 0) + delta, 0), 50);
      const copy = { ...prev };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });

  const submit = useMutation({
    mutationFn: () =>
      apiPost<{ orderId: string; total: number }>(
        "/admin/orders/phone",
        {
          action: "create",
          bookingId: stay?.bookingId,
          roomId: roomId || stay?.rooms[0]?.id,
          specialInstructions: note,
          delivered,
          items: chosen.map((item) => ({ id: item.id, quantity: quantities[item.id] })),
        },
        true,
      ),
    onSuccess: async (data) => {
      toast.success(`Order added for ${stay?.guestName}: ${formatINR(data.total)}${delivered ? " (delivered)" : ""}`);
      // Wait for the fresh bill so an invoice opened right after never shows the old total.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-booking-billing"] }),
      ]);
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof ApiError || error instanceof Error ? error.message : "Could not add the order"),
  });

  const ready = Boolean(stay) && chosen.length > 0 && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !submit.isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Add food ordered by phone</DialogTitle>
          <DialogDescription>
            It goes to the kitchen like any order and is added to the guest&apos;s bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          {presetStay ? (
            <p className="text-sm">
              <span className="font-medium">{presetStay.guestName}</span>
              <span className="text-muted-foreground"> · {presetStay.outletId}</span>
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="phone-order-stay">Guest and room</Label>
              <select
                id="phone-order-stay"
                className={selectClass}
                value={bookingId}
                onChange={(e) => {
                  setBookingId(e.target.value);
                  setRoomId(stays.find((entry) => entry.bookingId === e.target.value)?.rooms[0]?.id ?? "");
                  setQuantities({});
                }}
                disabled={staysQuery.isLoading}
              >
                <option value="">{staysQuery.isLoading ? "Loading guests" : stays.length ? "Select a checked-in guest" : "No guests are checked in"}</option>
                {stays.map((entry) => (
                  <option key={entry.bookingId} value={entry.bookingId}>
                    {entry.rooms.map((room) => room.code).join(", ")} · {entry.guestName} ({entry.outletId})
                  </option>
                ))}
              </select>
            </div>
          )}

          {stay && stay.rooms.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="phone-order-room">Deliver to</Label>
              <select id="phone-order-room" className={selectClass} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {stay.rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    Room {room.code}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {stay ? (
            <>
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" />
              {menuQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading menu</p>
              ) : sections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No dishes match.</p>
              ) : (
                <div className="space-y-5">
                  {sections.map((section) => (
                    <section key={section.id} aria-label={section.name}>
                      <h3 className="eyebrow mb-2">{section.name}</h3>
                      <ul className="divide-y rounded-md border">
                        {section.items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0">
                              <span className="block truncate">{item.name}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatINR(item.price)}
                                {item.description ? ` · ${item.description}` : ""}
                              </span>
                            </span>
                            <QtyStepper
                              name={item.name ?? "item"}
                              quantity={quantities[item.id] ?? 0}
                              onInc={() => setQty(item.id, 1)}
                              onDec={() => setQty(item.id, -1)}
                              disableInc={(quantities[item.id] ?? 0) >= 50}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
                <span>
                  <span className="font-medium">Already delivered</span>
                  <span className="block text-xs text-muted-foreground">
                    Adds it to the bill as delivered. The kitchen is not alerted. Untick it if the kitchen still has to prepare it.
                  </span>
                </span>
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="phone-order-note">Note for the kitchen</Label>
                <Textarea id="phone-order-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Less spicy, no onion" />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="items-center gap-3 border-t px-6 py-4 sm:justify-between">
          <p className="text-sm tabular-nums">
            {chosen.length} item{chosen.length === 1 ? "" : "s"} · <span className="font-semibold">{formatINR(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
              Cancel
            </Button>
            <Button type="button" onClick={() => submit.mutate()} disabled={!ready}>
              {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Add to bill
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
