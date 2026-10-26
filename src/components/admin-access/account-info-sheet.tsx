"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDate, formatINR, formatNumber } from "@/components/admin/format";
import { StatCard } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiPost } from "@/lib/apiClient";
import { paymentModeLabel } from "@/lib/payment-modes";

type Info = {
  user: { id: string; email: string; name: string; phone?: string; roles: string[]; isActive: boolean; hasAccount?: boolean };
  since: string | null;
  stays: {
    bookings: number;
    byStatus: Record<string, number>;
    nights: number;
    completed: number;
    averageNights: number;
    lastStay: string | null;
    branches: Array<{ name: string; count: number }>;
  };
  spend: { billed: number; gst: number; upcomingValue: number; payments: Record<string, number> };
  food: { orders: number; total: number; topDishes: Array<{ name: string; count: number }> };
  recent: Array<{ id: string; code: string; branch: string; status: string; checkIn: string | null; checkOut: string | null; nights: number; amount: number; rooms: string[] }>;
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

/** How one guest has used the hotel. Identity documents and signatures are never shown here. */
export type InfoTarget = { kind: "account"; id: string; name: string; email: string } | { kind: "guest"; key: string; name: string; email: string; phone: string };

export function AccountInfoSheet({ account, onClose }: { account: InfoTarget | null; onClose: () => void }) {
  const ref = account ? (account.kind === "account" ? account.id : account.key) : "";
  const info = useQuery({
    queryKey: ["access-user-info", account?.kind, ref],
    queryFn: () =>
      apiPost<Info>("/admin/access", account?.kind === "guest" ? { action: "guest_info", key: ref } : { action: "user_info", id: ref }, true),
    enabled: Boolean(account),
    staleTime: 30_000,
  });
  const data = info.data;
  const paymentRows = Object.entries(data?.spend.payments ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <Sheet open={account !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle>{account?.name || account?.email}</SheetTitle>
          <SheetDescription>
            {[account?.email, account?.kind === "guest" ? (data?.user.phone || account.phone) : ""].filter(Boolean).join(" · ")}
            {account?.kind === "guest" ? " · No Google account" : ""}
            {data?.since ? ` · Joined ${formatDate(data.since)}` : ""}
          </SheetDescription>
        </SheetHeader>

        {info.isLoading ? (
          <div className="mt-6 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : info.isError || !data ? (
          <p role="alert" className="mt-6 text-sm text-destructive">{info.error instanceof Error ? info.error.message : "Could not load the details."}</p>
        ) : (
          <div className="mt-6 space-y-7">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Bookings" value={formatNumber(data.stays.bookings)} hint={`${formatNumber(data.stays.completed)} completed`} />
              <StatCard label="Nights stayed" value={formatNumber(data.stays.nights)} hint={data.stays.averageNights ? `${data.stays.averageNights} nights on average` : "No finished stays yet"} />
              <StatCard label="Billed" value={formatINR(data.spend.billed)} hint={`incl. ${formatINR(data.spend.gst)} GST`} />
              <StatCard label="Food ordered" value={formatINR(data.food.total)} hint={`${formatNumber(data.food.orders)} order${data.food.orders === 1 ? "" : "s"}`} />
            </div>

            {data.spend.upcomingValue > 0 ? (
              <p className="text-sm text-muted-foreground">Upcoming and open bookings are worth {formatINR(data.spend.upcomingValue)} before GST.</p>
            ) : null}
            {data.stays.lastStay ? <p className="text-sm text-muted-foreground">Last stay ended {formatDate(data.stays.lastStay)}.</p> : null}

            {Object.keys(data.stays.byStatus).length > 0 ? (
              <Block title="Bookings by status">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.stays.byStatus).map(([status, count]) => (
                    <span key={status} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm">
                      <StatusBadge status={status} />
                      <span className="tabular-nums">{count}</span>
                    </span>
                  ))}
                </div>
              </Block>
            ) : null}

            {data.stays.branches.length > 0 ? (
              <Block title="Branches">
                <ul className="divide-y rounded-md border bg-card text-sm">
                  {data.stays.branches.map((branch) => (
                    <li key={branch.name} className="flex justify-between p-3">
                      <span>{branch.name}</span>
                      <span className="tabular-nums text-muted-foreground">{branch.count} booking{branch.count === 1 ? "" : "s"}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}

            {paymentRows.length > 0 ? (
              <Block title="How they paid">
                <ul className="divide-y rounded-md border bg-card text-sm">
                  {paymentRows.map(([mode, amount]) => (
                    <li key={mode} className="flex justify-between p-3">
                      <span>{paymentModeLabel(mode)}</span>
                      <span className="tabular-nums">{formatINR(amount)}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}

            {data.food.topDishes.length > 0 ? (
              <Block title="Most ordered dishes">
                <ul className="divide-y rounded-md border bg-card text-sm">
                  {data.food.topDishes.map((dish) => (
                    <li key={dish.name} className="flex justify-between p-3">
                      <span>{dish.name}</span>
                      <Badge variant="secondary" className="tabular-nums">{dish.count}</Badge>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}

            <Block title="Recent bookings">
              {data.recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">No bookings are linked to this account.</p>
              ) : (
                <ul className="divide-y rounded-md border bg-card text-sm">
                  {data.recent.map((booking) => (
                    <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <span className="min-w-0">
                        <span className="font-mono text-xs">{booking.code}</span>
                        <span className="block">{booking.branch}{booking.rooms.length ? ` · ${booking.rooms.join(", ")}` : ""}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(booking.checkIn)} to {formatDate(booking.checkOut)}, {booking.nights} night{booking.nights === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <StatusBadge status={booking.status} />
                        <span className="tabular-nums">{formatINR(booking.amount)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
