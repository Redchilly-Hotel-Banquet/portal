"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { apiGet } from "@/lib/apiClient";
import { SITE } from "@/components/site/site-config";
import { Section } from "@/components/site/section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OPENING_HOURS } from "./hours";
import { normaliseOutlets, toMapEmbedSrc } from "./outlets";
import { MessageForm } from "./message-form";

const mailtoHref = `mailto:${SITE.email}?subject=${encodeURIComponent("Inquiry: Red Chilly")}&body=${encodeURIComponent(
  "Hi Red Chilly Team,\n\nI'd like to know more about...\n\nThanks,\n",
)}`;
const whatsappHref = `https://wa.me/${SITE.phoneTel.replace("+", "")}`;

export function ContactClient() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["contact-outlets"],
    queryFn: () => apiGet<unknown>("/public/outlets"),
    staleTime: 60 * 1000,
  });

  const outlets = useMemo(() => normaliseOutlets(data), [data]);
  const maps = useMemo(() => outlets.filter((o) => o.mapUrl), [outlets]);

  return (
    <>
      <Section className="grid gap-12 md:grid-cols-2">
        <div className="space-y-8">
          <dl className="space-y-5 text-sm">
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd className="mt-0.5">
                  <a href={`tel:${SITE.phoneTel}`} className="font-medium underline-offset-4 hover:underline">
                    {SITE.phoneDisplay}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="mt-0.5">
                  <a href={mailtoHref} className="break-all font-medium underline-offset-4 hover:underline">
                    {SITE.email}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden />
              <div>
                <dt className="text-xs text-muted-foreground">Hours</dt>
                <dd className="mt-0.5">
                  {OPENING_HOURS.days}, <span className="tabular-nums">{OPENING_HOURS.time}</span>
                </dd>
              </div>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={mailtoHref}>
                <Mail strokeWidth={1.75} aria-hidden />
                Send email
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                <Phone strokeWidth={1.75} aria-hidden />
                WhatsApp
              </a>
            </Button>
          </div>

          <div>
            <p className="eyebrow">Locations</p>
            <div className="mt-3 border-t border-border">
              {isLoading ? (
                <div className="space-y-3 py-4" aria-busy="true">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : outlets.length > 0 ? (
                outlets.map((outlet) => (
                  <div key={outlet.id} className="border-b border-border py-4 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <MapPin className="h-4 w-4 text-brass" strokeWidth={1.75} aria-hidden />
                      {outlet.name}
                    </p>
                    <p className="mt-1.5 text-muted-foreground">{outlet.address ?? `${SITE.name}, ${SITE.address}`}</p>
                    {(outlet.phone || outlet.email) && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {outlet.phone && <a href={`tel:${outlet.phone}`} className="hover:text-foreground hover:underline">{outlet.phone}</a>}
                        {outlet.phone && outlet.email && "  |  "}
                        {outlet.email && <a href={`mailto:${outlet.email}`} className="hover:text-foreground hover:underline">{outlet.email}</a>}
                      </p>
                    )}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {outlet.mapUrl && (
                        <a
                          href={outlet.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-foreground hover:underline"
                        >
                          View on Maps
                        </a>
                      )}
                    </p>
                  </div>
                ))
              ) : (
                <div className="border-b border-border py-4 text-sm">
                  {isError && (
                    <p role="alert" className="mb-2 text-destructive">
                      {error instanceof Error ? error.message : "Could not load branch details."}
                    </p>
                  )}
                  <p className="font-medium">{SITE.name}</p>
                  <p className="mt-1.5 text-muted-foreground">{SITE.address}</p>
                  <ul className="mt-2 space-y-1">
                    {SITE.branches.map((b) => (
                      <li key={b.name}>
                        <a
                          href={b.mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {b.name} on Maps
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <MessageForm />
      </Section>

      {maps.length > 0 && (
        <Section eyebrow="Map" title="Find us" className="border-t border-border">
          <div className="grid gap-6 md:grid-cols-2">
            {maps.map((outlet) => (
              <figure key={`map-${outlet.id}`} className="overflow-hidden rounded-md border border-border">
                <iframe
                  title={`Map of ${outlet.name}`}
                  className="h-64 w-full md:h-80"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={toMapEmbedSrc(outlet.mapUrl as string)}
                />
                <figcaption className="border-t border-border bg-surface px-4 py-2 text-sm">{outlet.name}</figcaption>
              </figure>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
