import Link from "next/link";
import { ArrowRight, BedDouble, PartyPopper, Utensils } from "lucide-react";
import { Section } from "@/components/site/section";

const OFFERINGS = [
  {
    icon: BedDouble,
    eyebrow: "Stay",
    title: "Rooms",
    text: "Spacious rooms with plush bedding and fast Wi-Fi. Housekeeping, room service and support are available around the clock.",
    href: "/book-room",
    cta: "Check availability",
  },
  {
    icon: Utensils,
    eyebrow: "Dine",
    title: "Restaurant",
    text: "North Indian and continental cooking, from signature kebabs to comfort classics. Order from your table or room and follow the status live.",
    href: "/menu",
    cta: "View menu",
  },
  {
    icon: PartyPopper,
    eyebrow: "Celebrate",
    title: "Banquet hall",
    text: "Weddings, sangeet, receptions and corporate events. Halls are configurable for 200 to 500+ guests, with a dedicated event coordinator.",
    href: "/banquet",
    cta: "Send an enquiry",
  },
] as const;

export function Offerings() {
  return (
    <Section eyebrow="The property" title="What we offer">
      <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-3">
        {OFFERINGS.map(({ icon: Icon, eyebrow, title, text, href, cta }) => (
          <article key={title} className="flex flex-col bg-card p-6">
            <Icon className="h-5 w-5 text-brass" strokeWidth={1.75} aria-hidden />
            <p className="eyebrow mt-5">{eyebrow}</p>
            <h3 className="mt-2 text-xl">{title}</h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
            <Link
              href={href}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {cta}
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Link>
          </article>
        ))}
      </div>
    </Section>
  );
}
