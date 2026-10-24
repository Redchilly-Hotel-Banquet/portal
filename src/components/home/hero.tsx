import Image from "next/image";
import Link from "next/link";
import { BedDouble, QrCode, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/components/site/site-config";

export function Hero() {
  return (
    <section className="border-b border-border bg-surface">
      <div className="page-container grid items-center gap-10 py-14 md:grid-cols-[1.4fr_1fr] md:py-24">
        <div>
          <p className="eyebrow">Gorakhpur, Uttar Pradesh</p>
          <h1 className="mt-4 text-4xl leading-[1.1] tracking-tight sm:text-5xl">
            Rooms, restaurant and banquet hall under one roof.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Reserve a room, order to your table or room by QR code, or enquire about hosting your event at {SITE.name}, Gorakhpur.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" asChild>
              <Link href="/book-room">
                <BedDouble strokeWidth={1.75} aria-hidden />
                Book a room
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/menu">
                <Utensils strokeWidth={1.75} aria-hidden />
                View menu
              </Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="/qr">
                <QrCode strokeWidth={1.75} aria-hidden />
                Scan table QR
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <div className="rounded-md border border-border bg-card p-4">
            <Image
              src="/logo.jpeg"
              alt="Red Chilly The Restaurant and Banquet Hall"
              width={280}
              height={280}
              priority
              className="h-auto w-48 object-contain sm:w-64"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
