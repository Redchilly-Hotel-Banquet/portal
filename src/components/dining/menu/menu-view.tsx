"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Receipt, Search, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/admin/empty-state";
import { apiGet, apiPost } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { useCart } from "../cart";
import { DiningHeading } from "../dining-heading";
import { DietMark } from "../diet-mark";
import { useGuestSession } from "../use-guest-session";
import type { MenuItem, MenuResponse, OrderRecord, OutletInfo } from "../types";
import { errorMessage, locationLabel } from "../utils";
import { CartBar } from "./cart-bar";
import { CartSummary } from "./cart-summary";
import { CategoryNav } from "./category-nav";
import { MenuItemRow } from "./menu-item-row";
import { buildSections, filterItems, type DietFilter } from "./menu-sections";

const DIET_OPTIONS: { value: DietFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "veg", label: "Vegetarian" },
  { value: "non-veg", label: "Non-vegetarian" },
];

const VIEW_ONLY_MESSAGE = "Browsing only. Scan the QR code in your room or on your table to place an order.";

function MenuSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      {[0, 1].map((s) => (
        <div key={s} className="space-y-4">
          <Skeleton className="h-7 w-40" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2 border-b border-border pb-5">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MenuView() {
  const router = useRouter();
  const { session, ready: sessionReady, stayRooms, chooseRoom } = useGuestSession();

  const lockedOutletId = session?.outletId || null;
  const canOrder = Boolean(lockedOutletId);

  const [browseOutlet, setBrowseOutlet] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [diet, setDiet] = useState<DietFilter>("all");

  const outletId = lockedOutletId ?? browseOutlet;
  const cart = useCart(lockedOutletId);

  const menu = useQuery<MenuResponse>({
    queryKey: ["menu", outletId ?? "ALL"],
    enabled: sessionReady,
    queryFn: () => apiPost<MenuResponse, { outletId?: string }>("/public/menu/query", { outletId: outletId ?? undefined }),
    staleTime: 60_000,
    retry: (count) => count < 2,
    refetchOnWindowFocus: false,
  });

  const outlets = useQuery<{ outlets: OutletInfo[] }>({
    queryKey: ["public-outlets"],
    enabled: sessionReady && !canOrder,
    queryFn: () => apiGet<{ outlets: OutletInfo[] }>("/public/outlets"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const trackOrders = Boolean(canOrder && session?.bookingId && session.bookingStatus !== "CHECKED_OUT");
  const guestOrders = useQuery<{ orders: OrderRecord[] }>({
    queryKey: ["guest-orders-summary", session?.bookingId],
    enabled: trackOrders,
    queryFn: () => apiPost<{ orders: OrderRecord[] }, { bookingId?: string }>("/public/orders/guest", { bookingId: session?.bookingId }),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
  const hasGuestOrders = Boolean(guestOrders.data?.orders?.length);

  const sections = useMemo(() => {
    const items = filterItems(menu.data?.items ?? [], query, diet);
    return buildSections(items, menu.data?.categories ?? []);
  }, [menu.data, query, diet]);

  const visibleCount = sections.reduce((n, s) => n + s.items.length, 0);
  const quantityOf = (id: string) => cart.items.find((i) => i.id === id)?.quantity ?? 0;

  const review = () => {
    if (!canOrder) return void toast.info(VIEW_ONLY_MESSAGE);
    if (!cart.items.length) return void toast.error("Your order is empty.");
    router.push("/checkout");
  };

  const add = (item: MenuItem) => {
    if (!canOrder) return void toast.info(VIEW_ONLY_MESSAGE);
    if (item.is_available === false) return void toast.info("This dish is currently unavailable.");
    cart.add(item);
  };

  const place = session ? locationLabel(session.type, session.code) : "";
  const fromStay = session?.source === "account";
  const description = !sessionReady ? undefined : canOrder ? (
    <>
      Ordering to <span className="font-medium text-foreground">{place}</span>
      {session?.outletName ? <> at {session.outletName}</> : null}
      {fromStay ? " from your stay" : ""}.{" "}
      {fromStay && stayRooms.length > 1 ? (
        <span className="mt-2 flex items-center gap-2">
          <span>Room:</span>
          <Select value={session?.id} onValueChange={chooseRoom}>
            <SelectTrigger aria-label="Choose the room to order to" className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stayRooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {locationLabel("ROOM", room.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      ) : null}
      <Link href="/qr" className="underline underline-offset-4 hover:text-foreground">
        {fromStay ? "Order to a table instead?" : "Not your location?"}
      </Link>
    </>
  ) : (
    <>
      {VIEW_ONLY_MESSAGE}{" "}
      <Link href="/qr" className="font-medium text-primary underline underline-offset-4">
        Scan QR code
      </Link>
    </>
  );

  return (
    <>
      <DiningHeading
        eyebrow="Dining"
        title="Menu"
        description={description}
        actions={
          canOrder && hasGuestOrders ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/my-orders">
                <Receipt strokeWidth={1.75} aria-hidden />
                My orders
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="page-container pb-28 lg:pb-16">
        <div className="sticky top-16 z-30 -mx-4 space-y-3 border-b border-border bg-background px-4 pb-0 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search dishes"
                aria-label="Search dishes"
                className="pl-9"
              />
            </div>
            <div role="group" aria-label="Dietary filter" className="flex flex-wrap gap-1.5">
              {DIET_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={diet === o.value}
                  onClick={() => setDiet(o.value)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors",
                    diet === o.value ? "border-foreground bg-foreground text-background" : "border-input bg-background hover:bg-accent",
                  )}
                >
                  {o.value !== "all" && (
                    <span className="rounded-[3px] bg-background p-px">
                      <DietMark veg={o.value === "veg"} />
                    </span>
                  )}
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {!canOrder && sessionReady && (outlets.data?.outlets.length ?? 0) > 1 && (
            <div role="group" aria-label="Branch" className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant={browseOutlet === null ? "default" : "outline"} onClick={() => setBrowseOutlet(null)}>
                All branches
              </Button>
              {outlets.data?.outlets.map((o) => {
                const value = o.location_key || o.id;
                return (
                  <Button key={o.id} type="button" size="sm" variant={browseOutlet === value ? "default" : "outline"} onClick={() => setBrowseOutlet(value)}>
                    {o.name || o.location_key || "Branch"}
                  </Button>
                );
              })}
            </div>
          )}

          <CategoryNav sections={sections} />
        </div>

        <div className="mt-8 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            <p className="sr-only" aria-live="polite">
              {menu.isSuccess ? `${visibleCount} dishes shown` : ""}
            </p>

            {(!sessionReady || menu.isLoading) && <MenuSkeleton />}

            {menu.isError && (
              <EmptyState
                icon={UtensilsCrossed}
                title="The menu could not be loaded"
                description={errorMessage(menu.error, "Please try again in a moment.")}
                action={
                  <Button type="button" variant="outline" onClick={() => menu.refetch()}>
                    Try again
                  </Button>
                }
              />
            )}

            {menu.isSuccess && visibleCount === 0 && (
              <EmptyState
                icon={UtensilsCrossed}
                title="No dishes found"
                description={query || diet !== "all" ? "Try a different search or clear the dietary filter." : "The menu has no dishes available right now."}
                action={
                  query || diet !== "all" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setDiet("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )}

            {menu.isSuccess &&
              sections.map((section) => (
                <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-44 pb-10 last:pb-0">
                  <div className="flex items-baseline gap-4">
                    <h2 id={`${section.id}-title`} className="text-2xl tracking-tight">
                      {section.name}
                    </h2>
                    <span aria-hidden className="h-px flex-1 bg-brass/40" />
                  </div>
                  <ul>
                    {section.items.map((item) => (
                      <MenuItemRow
                        key={item.id}
                        item={item}
                        quantity={quantityOf(item.id)}
                        canOrder={canOrder}
                        onAdd={() => add(item)}
                        onInc={() => cart.inc(item.id)}
                        onDec={() => cart.dec(item.id)}
                      />
                    ))}
                  </ul>
                </section>
              ))}
          </div>

          {canOrder && (
            <div className="hidden lg:block">
              <div className="sticky top-44">
                <CartSummary items={cart.items} count={cart.count} total={cart.total} prep={cart.prep} onInc={cart.inc} onDec={cart.dec} onReview={review} />
              </div>
            </div>
          )}
        </div>
      </div>

      {canOrder && <CartBar count={cart.count} total={cart.total} onReview={review} />}
    </>
  );
}
