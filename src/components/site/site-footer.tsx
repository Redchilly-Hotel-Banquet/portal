import Link from "next/link";
import { NAV_LINKS, SITE } from "./site-config";

const linkCls = "text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-surface">
      <div className="page-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-xl">{SITE.name}</p>
          <p className="eyebrow mt-1">{SITE.descriptor}</p>
          <address className="mt-4 text-sm not-italic leading-relaxed text-muted-foreground">
            {SITE.address}
          </address>
        </div>

        <div>
          <h2 className="eyebrow font-sans text-xs">Explore</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}><Link href={l.href} className={linkCls}>{l.label}</Link></li>
            ))}
            <li><Link href="/qr" className={linkCls}>Scan table QR</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow font-sans text-xs">Reach us</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li><a href={`tel:${SITE.phoneTel}`} className={`${linkCls} tabular-nums`}>{SITE.phoneDisplay}</a></li>
            <li><a href={`mailto:${SITE.email}`} className={`${linkCls} break-all`}>{SITE.email}</a></li>
            <li><Link href="/contact-us" className={linkCls}>Contact page</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow font-sans text-xs">Find us</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {SITE.branches.map((b) => (
              <li key={b.name}>
                <a href={b.mapUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  {b.name}, Gorakhpur<span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="page-container flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} {SITE.name}. All rights reserved.</p>
          <p>Gorakhpur, Uttar Pradesh</p>
        </div>
      </div>
    </footer>
  );
}
