"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tenDigitPhone, whatsappLink } from "@/lib/phone";
import { DEFAULT_WHATSAPP_TEMPLATE, renderTemplate } from "@/lib/whatsapp-template";
import type { Booking, WelcomeInfo } from "./types";

type Recipient = { name: string; phone: string };

/** The booker plus every checked-in guest who has a usable mobile number, one entry per number. */
const recipientsOf = (booking: Booking): Recipient[] => {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  const add = (name: string | undefined, raw: string | null | undefined) => {
    const phone = tenDigitPhone(raw);
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    out.push({ name: name?.trim() || "Guest", phone });
  };
  add(booking.guest_name, booking.guest_phone);
  for (const guest of booking.checkin_details?.guests ?? []) add(guest.full_name, guest.phone);
  return out;
};

const roomCodes = (booking: Booking): string[] => {
  const fromCheckin = (booking.checkin_details?.assigned_rooms ?? []).map((room) => room.code).filter(Boolean);
  const codes = fromCheckin.length ? fromCheckin : (booking.rooms_allocated ?? []).map((room) => room.code).filter(Boolean);
  return codes as string[];
};

/** Same rule as the server: the saved check-in rooms win, else the loose booking fields. */
const heldRoomIds = (booking: Booking): string[] => {
  const fromCheckin = (booking.checkin_details?.assigned_rooms ?? []).map((room) => room.id).filter(Boolean);
  if (fromCheckin.length) return fromCheckin;
  const loose = [booking.room_id, ...(booking.room_ids ?? []), ...(booking.rooms_allocated ?? []).map((room) => room.room_id)];
  return Array.from(new Set(loose.filter((id): id is string => Boolean(id))));
};

const norm = (value: string | undefined) => (value ?? "").trim().toLowerCase();

type WifiLine = { floor: string | null; name: string; password: string };

/**
 * Wi-Fi for the floors the booking's rooms are on. Each room's Floor picks a floor entry; rooms on a
 * floor with no entry (or no Floor set) use the branch default. Several floors give several entries.
 */
export const wifiFor = (booking: Booking, welcome: WelcomeInfo | undefined, roomLevels: Record<string, string> | undefined): WifiLine[] => {
  if (!welcome) return [];
  const byFloor = new Map((welcome.wifi_floors ?? []).map((entry) => [norm(entry.floor), entry]));
  const fallback = welcome.wifi_name || welcome.wifi_password ? { floor: null, name: welcome.wifi_name, password: welcome.wifi_password } : null;

  const lines = new Map<string, WifiLine>();
  const levels = heldRoomIds(booking).map((id) => roomLevels?.[id] ?? "");
  for (const level of levels.length ? levels : [""]) {
    const match = level ? byFloor.get(norm(level)) : undefined;
    const line = match && (match.wifi_name || match.wifi_password)
      ? { floor: match.floor, name: match.wifi_name, password: match.wifi_password }
      : fallback;
    if (line) lines.set(`${line.floor}|${line.name}|${line.password}`, line);
  }
  return Array.from(lines.values());
};

export const welcomeMessage = (
  booking: Booking,
  welcome: WelcomeInfo | undefined,
  guestName: string,
  roomLevels?: Record<string, string>,
): string => {
  const wifi = wifiFor(booking, welcome, roomLevels);
  const wifiText = wifi
    .flatMap((entry) => {
      const label = wifi.length > 1 && entry.floor ? ` (${entry.floor})` : "";
      return [entry.name ? `Wi-Fi${label}: ${entry.name}` : "", entry.password ? `Wi-Fi password${label}: ${entry.password}` : ""].filter(Boolean);
    })
    .join("\n");
  return renderTemplate(welcome?.whatsapp_template?.trim() || DEFAULT_WHATSAPP_TEMPLATE, {
    guest: guestName,
    hotel: welcome?.name || "Red Chilly",
    room: roomCodes(booking).join(", "),
    checkin_id: booking.checkin_id ?? "",
    wifi: wifiText,
    note: welcome?.welcome_message ?? "",
  });
};

export function StayMessages({
  booking,
  welcome,
  roomLevels,
}: {
  booking: Booking;
  welcome: WelcomeInfo | undefined;
  roomLevels?: Record<string, string>;
}) {
  const recipients = recipientsOf(booking);
  const missingWifi = wifiFor(booking, welcome, roomLevels).length === 0;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Check-in ID</p>
        <p className="font-mono text-2xl tracking-widest tabular-nums">{booking.checkin_id ?? "Not assigned"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Guests need this to order food to their room, and only while checked in.
        </p>
      </div>

      {recipients.length ? (
        <ul className="divide-y rounded-md border bg-card text-sm">
          {recipients.map((recipient) => {
            const href = whatsappLink(recipient.phone, welcomeMessage(booking, welcome, recipient.name, roomLevels));
            return (
              <li key={recipient.phone} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{recipient.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">+91 {recipient.phone}</span>
                </span>
                {href ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Send stay details to ${recipient.name} on WhatsApp`}>
                      <MessageCircle className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden />
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No guest mobile numbers yet. Add them under Check-in to send the details on WhatsApp.
        </p>
      )}

      {missingWifi ? (
        <p className="text-xs text-muted-foreground">
          No Wi-Fi details match this booking's room, so messages go without them. Add them under Branches.
        </p>
      ) : null}
    </div>
  );
}
