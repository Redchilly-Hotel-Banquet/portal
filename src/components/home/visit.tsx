import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { Section } from "@/components/site/section";
import { SITE } from "@/components/site/site-config";
import { OPENING_HOURS } from "@/components/contact/hours";

export function Visit() {
  return (
    <Section eyebrow="Visit" title="Location and hours">
      <div className="grid gap-10 md:grid-cols-2">
        <dl className="space-y-5 text-sm">
          <div className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
            <div>
              <dt className="sr-only">Address</dt>
              <dd>
                {SITE.name} {SITE.descriptor}
                <br />
                {SITE.address}
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
            <div>
              <dt className="sr-only">Hours</dt>
              <dd>
                {OPENING_HOURS.days}
                <br />
                <span className="tabular-nums">{OPENING_HOURS.time}</span>
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
            <div>
              <dt className="sr-only">Phone</dt>
              <dd>
                <a href={`tel:${SITE.phoneTel}`} className="underline-offset-4 hover:underline">
                  {SITE.phoneDisplay}
                </a>
              </dd>
            </div>
          </div>
          <div className="flex gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
            <div>
              <dt className="sr-only">Email</dt>
              <dd>
                <a href={`mailto:${SITE.email}`} className="break-all underline-offset-4 hover:underline">
                  {SITE.email}
                </a>
              </dd>
            </div>
          </div>
        </dl>

        <div>
          <p className="eyebrow">Branches</p>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {SITE.branches.map((branch) => (
              <li key={branch.name} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{branch.name}, Gorakhpur</span>
                <a
                  href={branch.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open in Maps
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
