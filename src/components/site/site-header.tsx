"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "./account-menu";
import { cn } from "@/lib/utils";
import { NAV_LINKS, SITE } from "./site-config";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <Image src="/logo.jpeg" alt="" width={36} height={36} priority className="h-9 w-9 rounded-full border border-border object-cover" />
      <span className="font-display text-xl leading-none tracking-tight">{SITE.name}</span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/90">
      <div className="page-container flex h-16 items-center justify-between gap-4">
        <Brand />

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isActive(pathname, l.href) ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive(pathname, l.href) && "text-foreground underline decoration-brass decoration-1 underline-offset-[10px]",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
            <Link href="/qr"><QrCode className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />Scan table QR</Link>
          </Button>
          <AccountMenu />
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-[18rem] flex-col gap-0 p-0">
              <div className="border-b border-border p-5">
                <SheetTitle className="font-display text-xl">{SITE.name}</SheetTitle>
                <SheetDescription className="eyebrow mt-1">{SITE.descriptor}</SheetDescription>
              </div>
              <nav aria-label="Mobile" className="flex flex-col p-2">
                {[{ href: "/", label: "Home" }, ...NAV_LINKS].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={(l.href === "/" ? pathname === "/" : isActive(pathname, l.href)) ? "page" : undefined}
                    className="rounded-sm px-3 py-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:font-medium"
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto border-t border-border p-5">
                <Button asChild className="w-full">
                  <Link href="/qr" onClick={() => setOpen(false)}>
                    <QrCode className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />Scan table QR
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
