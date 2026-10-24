import Link from "next/link";
import { Button } from "@/components/ui/button";

const POINTS = [
  "Configurable halls for 200 to 500+ guests",
  "Decor and AV partners on request",
  "Curated set menus and live counters",
  "A dedicated event coordinator",
] as const;

export function BanquetFeature() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="page-container grid gap-8 py-12 md:grid-cols-2 md:py-16">
        <div>
          <p className="eyebrow">Banquet</p>
          <h2 className="mt-3 text-2xl tracking-tight sm:text-3xl">Plan your event with us</h2>
          <p className="mt-3 max-w-md text-muted-foreground">
            Tell us the date, guest count and occasion. Our team replies with availability and packages.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/banquet">Send an enquiry</Link>
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-border self-center border-y border-border text-sm">
          {POINTS.map((point) => (
            <li key={point} className="py-3">
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
