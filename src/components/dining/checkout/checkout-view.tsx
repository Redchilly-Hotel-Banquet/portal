"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Loader2, MessageSquarePlus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/admin/empty-state";
import { Money } from "@/components/admin/money";
import { apiPost } from "@/lib/apiClient";
import { useCart } from "../cart";
import { DiningHeading } from "../dining-heading";
import { QtyStepper } from "../qty-stepper";
import { useGuestSession } from "../use-guest-session";
import { errorMessage, locationLabel } from "../utils";

type PlaceOrderBody = {
  outletId: string;
  roomTableId: string | null;
  bookingId?: string;
  specialInstructions: string;
  items: { id: string; quantity: number; price: number; notes?: string }[];
  subtotal: number;
};

const MAX_NOTE = 200;
const MAX_INSTRUCTIONS = 500;

export function CheckoutView() {
  const router = useRouter();
  const { session, ready: sessionReady, update } = useGuestSession();
  const cart = useCart(session?.outletId);
  const [instructions, setInstructions] = useState("");
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);

  const loading = !sessionReady || !cart.ready;
  const checkedOut = session?.bookingStatus === "CHECKED_OUT";

  const placeOrder = async () => {
    if (placing) return;
    if (!session?.outletId) return void toast.info("Scan your room or table QR code to place an order.");
    if (checkedOut) return void toast.error("This booking has been checked out. New orders are not available.");
    if (!cart.items.length) return void toast.error("Your order is empty.");

    setPlacing(true);
    try {
      const data = await apiPost<{ orderId: string; bookingId?: string | null }, PlaceOrderBody>("/public/orders", {
        outletId: session.outletId,
        roomTableId: session.id || null,
        bookingId: session.bookingId,
        specialInstructions: instructions.trim(),
        items: cart.items.map((i) => ({ id: i.id, quantity: i.quantity, price: i.price, notes: i.notes })),
        subtotal: cart.total,
      });

      setPlaced(true);
      cart.clear();
      update({ ...session, bookingId: data?.bookingId ?? session.bookingId });
      toast.success("Order placed. The kitchen has been notified.");
      router.replace(`/order-status/${data.orderId}`);
    } catch (error) {
      toast.error(errorMessage(error, "We could not place your order. Please try again."));
      setPlacing(false);
    }
  };

  let body: React.ReactNode;
  if (placed) {
    body = (
      <p className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" aria-hidden />
        Order sent. Opening your order status.
      </p>
    );
  } else if (loading) {
    body = (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  } else if (!session?.outletId) {
    body = (
      <EmptyState
        icon={ShoppingBag}
        title="No room or table selected"
        description="Orders are placed from a room or table. Scan the QR code to continue."
        action={
          <Button asChild>
            <Link href="/qr">Scan QR code</Link>
          </Button>
        }
      />
    );
  } else if (cart.items.length === 0) {
    body = (
      <EmptyState
        icon={ShoppingBag}
        title="Your order is empty"
        description="Choose dishes from the menu and they will appear here."
        action={
          <Button asChild>
            <Link href="/menu">Browse menu</Link>
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-10">
          <section aria-labelledby="items-title">
            <h2 id="items-title" className="text-2xl tracking-tight">
              Your selection
            </h2>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {cart.items.map((item) => {
                const open = noteOpen[item.id] || Boolean(item.notes);
                return (
                  <li key={item.id} className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                          <Money value={item.price} /> each
                        </p>
                      </div>
                      <Money value={item.price * item.quantity} className="shrink-0 font-medium" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <QtyStepper name={item.name} quantity={item.quantity} onInc={() => cart.inc(item.id)} onDec={() => cart.dec(item.id)} />
                      {!open && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setNoteOpen((s) => ({ ...s, [item.id]: true }))}>
                          <MessageSquarePlus strokeWidth={1.75} aria-hidden />
                          Add a note
                        </Button>
                      )}
                    </div>
                    {open && (
                      <div className="mt-3">
                        <Label htmlFor={`note-${item.id}`} className="sr-only">
                          Note for {item.name}
                        </Label>
                        <Textarea
                          id={`note-${item.id}`}
                          rows={2}
                          maxLength={MAX_NOTE}
                          value={item.notes ?? ""}
                          onChange={(e) => cart.setNotes(item.id, e.target.value)}
                          placeholder="For this dish, for example less spicy"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="instructions-title">
            <h2 id="instructions-title" className="text-2xl tracking-tight">
              Instructions for the kitchen
            </h2>
            <Label htmlFor="instructions" className="sr-only">
              Special instructions
            </Label>
            <Textarea
              id="instructions"
              className="mt-4"
              rows={3}
              maxLength={MAX_INSTRUCTIONS}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Anything that applies to the whole order, for example no onion or garlic"
            />
          </section>
        </div>

        <aside aria-label="Order summary" className="h-fit rounded-lg border border-border bg-card p-5 lg:sticky lg:top-24">
          <p className="eyebrow">Summary</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Deliver to</dt>
              <dd className="text-right font-medium">{locationLabel(session.type, session.code)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="tabular-nums">{cart.count}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <dt className="font-medium">Total</dt>
              <dd>
                <Money value={cart.total} className="font-display text-2xl" />
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden />
            Estimated preparation <span className="tabular-nums">{cart.prep || 10}</span> minutes
          </p>
          {checkedOut && <p className="mt-4 text-sm text-destructive">This booking has been checked out. New orders are not available.</p>}
          <Button type="button" size="lg" className="mt-5 w-full" onClick={placeOrder} disabled={placing || checkedOut}>
            {placing && <Loader2 className="animate-spin" aria-hidden />}
            {placing ? "Placing order" : "Place order"}
          </Button>
          <Button asChild variant="ghost" className="mt-2 w-full">
            <Link href="/menu">Back to menu</Link>
          </Button>
        </aside>
      </div>
    );
  }

  return (
    <>
      <DiningHeading eyebrow="Dining" title="Review your order" description="Check your selection before sending it to the kitchen." />
      <div className="page-container py-10 md:py-14">{body}</div>
    </>
  );
}
