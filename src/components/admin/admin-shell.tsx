"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  ShoppingBag,
  Settings,
  Store,
  UserCog,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQueryClient } from "@tanstack/react-query";
import { getAdminUser, type AdminUser } from "@/lib/authSession";
import { clearAllUserData } from "@/lib/clearUserData";
import { cn } from "@/lib/utils";
import {
  getAdminScopes,
  hasAdminScope,
  useRequireAdminAccess,
  type AdminScope,
} from "@/hooks/useAdminAccess";

type NavItem = { label: string; href: string; icon: LucideIcon; scopes: AdminScope[] };

export const ADMIN_NAV: NavItem[] = [
  { label: "Overview", href: "/admin/dashboard", icon: LayoutDashboard, scopes: ["admin", "rooms", "kitchen"] },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag, scopes: ["admin", "kitchen"] },
  { label: "Bookings", href: "/admin/bookings", icon: CalendarCheck, scopes: ["admin", "rooms"] },
  { label: "Rooms and tables", href: "/admin/rooms", icon: BedDouble, scopes: ["admin", "rooms"] },
  { label: "Menu items", href: "/admin/menu-items", icon: Utensils, scopes: ["admin", "kitchen"] },
  { label: "Categories", href: "/admin/categories", icon: FolderKanban, scopes: ["admin"] },
  { label: "Branches", href: "/admin/branches", icon: Store, scopes: ["admin"] },
  { label: "Settings", href: "/admin/settings", icon: Settings, scopes: ["admin"] },
  { label: "Access", href: "/admin/access", icon: UserCog, scopes: ["admin"] },
  { label: "Analytics", href: "/admin/analytics", icon: BarChart3, scopes: ["admin"] },
];

const ROLE_LABEL: Record<AdminScope, string> = { admin: "Administrator", rooms: "Front desk", kitchen: "Kitchen" };

type AdminShellProps = {
  scope: AdminScope | AdminScope[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

type SidebarProps = {
  user: AdminUser;
  scopes: AdminScope[];
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
};

function SidebarContent({ user, scopes, pathname, onNavigate, onSignOut }: SidebarProps) {
  const items = ADMIN_NAV.filter((item) => hasAdminScope(scopes, item.scopes));
  const primaryRole = scopes.includes("admin") ? "admin" : scopes[0];
  const outletLabel = user.outlets.includes("all") ? "All branches" : `${user.outlets.length} branch${user.outlets.length === 1 ? "" : "es"}`;

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5">
        <Image src="/logo.jpeg" alt="" width={36} height={36} className="h-9 w-9 rounded-sm object-cover" />
        <div className="leading-tight">
          <p className="font-display text-base text-foreground">Red Chilly</p>
          <p className="eyebrow">Staff portal</p>
        </div>
      </div>

      <nav aria-label="Staff navigation" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden /> : null}
                  <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {primaryRole ? ROLE_LABEL[primaryRole] : "Staff"} · {outletLabel}
            </p>
          </div>
          <ThemeToggle />
        </div>
        <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" aria-busy="true" aria-label="Loading">
      <div className="hidden w-64 shrink-0 border-r border-border bg-surface p-5 lg:block">
        <Skeleton className="h-9 w-32" />
        <div className="mt-8 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6 lg:p-10">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    </div>
  );
}

export function AdminShell({ scope, title, description, actions, children }: AdminShellProps) {
  useRequireAdminAccess(scope);
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "";
  const [session, setSession] = useState<{ user: AdminUser; scopes: AdminScope[] } | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const required = useMemo(() => (Array.isArray(scope) ? scope : [scope]), [scope]);

  useEffect(() => {
    const user = getAdminUser();
    if (!user) return;
    const scopes = getAdminScopes();
    setSession(hasAdminScope(scopes, required) ? { user, scopes } : null);
  }, [required]);

  const signOut = () => {
    clearAllUserData(queryClient);
    router.replace("/admin/login");
  };

  if (!session) return <ShellSkeleton />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border lg:block">
        <SidebarContent user={session.user} scopes={session.scopes} pathname={pathname} onSignOut={signOut} />
      </aside>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Staff portal sections</SheetDescription>
          <SidebarContent
            user={session.user}
            scopes={session.scopes}
            pathname={pathname}
            onNavigate={() => setNavOpen(false)}
            onSignOut={signOut}
          />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-64">
        <header className="z-20 border-b border-border bg-background lg:sticky lg:top-0">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-3 px-4 py-4 sm:px-6 lg:px-10 lg:py-6">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="mt-0.5 shrink-0 lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <div className="min-w-0 flex-1 basis-40">
              <h1 className="truncate text-2xl leading-tight text-foreground sm:text-3xl">{title}</h1>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">{actions}</div> : null}
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
