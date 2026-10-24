"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccount, useGoogleEnabled } from "@/hooks/useAccount";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllUserData } from "@/lib/clearUserData";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "G";

/** Guest sign-in for the public site. Hidden entirely until Google sign-in is configured. */
export function AccountMenu({ className }: { className?: string }) {
  const account = useAccount();
  const queryClient = useQueryClient();
  const pathname = usePathname() ?? "/";
  const enabled = useGoogleEnabled();

  if (account === undefined) return null;

  if (!account) {
    if (!enabled) return null;
    return (
      <Button variant="ghost" size="sm" className={className} asChild>
        <a href={`/api/auth/google?next=${encodeURIComponent(pathname)}`}>Sign in</a>
      </Button>
    );
  }

  const signOut = () => {
    clearAllUserData(queryClient);
    // Reloading drops anything still held in memory (cart, half-filled forms) along with storage.
    window.location.reload();
  };

  const isStaff = account.roles.length > 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className} aria-label={`Account menu for ${account.name}`}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-secondary text-xs font-medium">
            {initials(account.name)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{account.name}</span>
          {account.email ? <span className="block truncate text-xs text-muted-foreground">{account.email}</span> : null}
          {isStaff ? (
            <span className="mt-1 block text-xs capitalize text-brass">{account.roles.join(", ")}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isStaff ? (
          <DropdownMenuItem asChild>
            <Link href="/admin/dashboard">
              <ShieldCheck className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
              Staff portal
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            My profile and bookings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/my-orders">
            <CalendarDays className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
            My orders
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
