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

export function Overview() {
  const [scopes, setScopes] = useState<AdminScope[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    setScopes(getAdminScopes());
    setName(getAdminUser()?.name ?? "");
  }, []);

  const isAdmin = scopes.includes("admin");

  const { data: outlets, isLoading, isError } = useQuery<OutletAnalytics[]>({
    queryKey: ANALYTICS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiPost<{ outlets: OutletAnalytics[] }>("/admin/analytics/outlets", {}, true);
      return res?.outlets ?? [];
    },
    enabled: isAdmin,
    refetchInterval: 30000,
  });

  const totals = outlets ? sumOutlets(outlets) : null;
  const sections = ADMIN_NAV.filter((item) => item.href !== "/admin/dashboard" && hasAdminScope(scopes, item.scopes));

  return (
    <AdminShell
      scope={["admin", "rooms", "kitchen"]}
      title="Overview"
      description={name ? `Signed in as ${name}.` : undefined}
    >
      <div className="space-y-10">
        {isAdmin && !isError ? (
          <section aria-labelledby="today-heading">
            <h2 id="today-heading" className="eyebrow mb-4">Across your branches</h2>
            {isLoading || !totals ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[118px] rounded-md" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Orders today" value={formatNumber(totals.today)} hint={`${formatNumber(totals.orders)} in total`} />
                <StatCard label="Active bookings" value={formatNumber(totals.active)} hint={`${formatNumber(totals.bookings)} in total`} />
                <StatCard label="Total revenue" value={<Money value={totals.revenue} />} hint="Orders and room bookings" />
                <StatCard label="Inventory" value={formatNumber(totals.rooms)} hint={`rooms, plus ${formatNumber(totals.tables)} tables`} />
              </div>
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
                      <span className="mt-1 block text-sm text-muted-foreground">{DESCRIPTIONS[item.href]}</span>
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
