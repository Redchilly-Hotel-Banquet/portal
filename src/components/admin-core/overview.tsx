"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { AdminShell, ADMIN_NAV } from "@/components/admin/admin-shell";
import { StatCard } from "@/components/admin/stat-card";
import { Money } from "@/components/admin/money";
import { formatNumber } from "@/components/admin/format";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminScopes, hasAdminScope, type AdminScope } from "@/hooks/useAdminAccess";
import { getAdminUser } from "@/lib/authSession";
import { apiPost } from "@/lib/apiClient";
import { ANALYTICS_QUERY_KEY, sumOutlets, type OutletAnalytics } from "./analytics-types";

const DESCRIPTIONS: Record<string, string> = {
  "/admin/orders": "Review incoming orders and move them through the kitchen.",
  "/admin/bookings": "Confirm, check in and check out room bookings.",
  "/admin/rooms": "Maintain rooms and dining tables, rates and availability.",
  "/admin/menu-items": "Add, edit or withdraw dishes on the menu.",
  "/admin/categories": "Organise the menu into categories.",
  "/admin/branches": "Manage branch details and locations.",
  "/admin/analytics": "Revenue, orders and bookings by branch.",
};

type KitchenFigures = { ordersToday: number; ordersTotal: number; openOrders: number; sales: number; dishesAvailable: number; dishesTotal: number };
type RoomsFigures = { activeBookings: number; checkedIn: number; awaiting: number; bookingsTotal: number; rooms: number; tables: number };
type OverviewResponse = { admin?: { outlets: OutletAnalytics[] }; kitchen?: KitchenFigures; rooms?: RoomsFigures };

const Cards = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
);

/** What a section is for when the account cannot edit, so the cards do not promise more than it can do. */
const STAFF_DESCRIPTIONS: Record<string, string> = {
  "/admin/menu-items": "Switch dishes on or off for your branch.",
  "/admin/rooms": "Switch rooms and tables on or off for your branch.",
};

export function Overview() {
  const [scopes, setScopes] = useState<AdminScope[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setScopes(getAdminScopes());
    setName(getAdminUser()?.name ?? "");
  }, []);

  const hasAccess = scopes.length > 0;
  const isAdmin = scopes.includes("admin");

  // The server returns only what this account's role is for, so nothing else is ever sent to the browser.
  const { data, isLoading, isError } = useQuery<OverviewResponse>({
    queryKey: [...ANALYTICS_QUERY_KEY, "overview"],
    queryFn: () => apiPost<OverviewResponse>("/admin/overview", {}, true),
    enabled: hasAccess,
    refetchInterval: 30000,
  });

  const totals = data?.admin ? sumOutlets(data.admin.outlets) : null;
  const sections = ADMIN_NAV.filter((item) => item.href !== "/admin/dashboard" && hasAdminScope(scopes, item.scopes));
  const heading = isAdmin ? "Across your branches" : "Your branches";

  return (
    <AdminShell
      scope={["admin", "rooms", "kitchen"]}
      title="Overview"
      description={name ? `Signed in as ${name}.` : undefined}
    >
      <div className="space-y-10">
        {hasAccess && !isError ? (
          <section aria-labelledby="today-heading" className="space-y-8">
            <h2 id="today-heading" className="eyebrow -mb-4">{heading}</h2>
            {isLoading || !data ? (
              <Cards>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[118px] rounded-md" />
                ))}
              </Cards>
            ) : (
              <>
                {totals ? (
                  <Cards>
                    <StatCard label="Orders today" value={formatNumber(totals.today)} hint={`${formatNumber(totals.orders)} in total`} />
                    <StatCard label="Active bookings" value={formatNumber(totals.active)} hint={`${formatNumber(totals.bookings)} in total`} />
                    <StatCard label="Total revenue" value={<Money value={totals.revenue} />} hint="Orders and room bookings" />
                    <StatCard label="Inventory" value={formatNumber(totals.rooms)} hint={`rooms, plus ${formatNumber(totals.tables)} tables`} />
                  </Cards>
                ) : null}
                {data.kitchen ? (
                  <Cards>
                    <StatCard label="Orders today" value={formatNumber(data.kitchen.ordersToday)} hint={`${formatNumber(data.kitchen.ordersTotal)} in total`} />
                    <StatCard label="Open orders" value={formatNumber(data.kitchen.openOrders)} hint="Waiting or being prepared" />
                    <StatCard label="Food sales" value={<Money value={data.kitchen.sales} />} hint="All orders so far" />
                    <StatCard label="Dishes on the menu" value={formatNumber(data.kitchen.dishesAvailable)} hint={`available of ${formatNumber(data.kitchen.dishesTotal)}`} />
                  </Cards>
                ) : null}
                {data.rooms ? (
                  <Cards>
                    <StatCard label="Active bookings" value={formatNumber(data.rooms.activeBookings)} hint={`${formatNumber(data.rooms.bookingsTotal)} in total`} />
                    <StatCard label="Checked in now" value={formatNumber(data.rooms.checkedIn)} hint="Guests staying" />
                    <StatCard label="Awaiting confirmation" value={formatNumber(data.rooms.awaiting)} hint="Pending bookings" />
                    <StatCard label="Inventory" value={formatNumber(data.rooms.rooms)} hint={`rooms, plus ${formatNumber(data.rooms.tables)} tables`} />
                  </Cards>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        <section aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="eyebrow mb-4">Your sections</h2>
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your account has no sections assigned. Contact an administrator.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sections.map((item) => (
                <li key={item.href} className="overflow-hidden rounded-md border border-border bg-card">
                  <Link
                    href={item.href}
                    className="group flex h-full items-start gap-4 p-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-lg leading-tight text-foreground">{item.label}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{!isAdmin && STAFF_DESCRIPTIONS[item.href] ? STAFF_DESCRIPTIONS[item.href] : DESCRIPTIONS[item.href]}</span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" strokeWidth={1.75} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
