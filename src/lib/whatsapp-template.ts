/** The welcome message sent to guests on WhatsApp. Each branch can edit its own wording under Settings. */
export const DEFAULT_WHATSAPP_TEMPLATE = `Welcome to {hotel}, {guest}!

Room: {room}
Check-in ID: {checkin_id}
Check-in: {checkin_time} · Check-out: {checkout_time}

To order food to your room, scan the QR code in your room or visit https://redchilly.in/qr?room={room}&outlet={hotel}, choose Room and enter this ID. Please do not share it.

{wifi}

{note}

We strive for your pleasant stay! Thank you for choosing {hotel}.`;

export const TEMPLATE_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: "guest", description: "The guest's name" },
  { key: "hotel", description: "The branch name. Inside a link it becomes the branch code the QR page needs, with + for spaces" },
  { key: "room", description: "Room number or numbers" },
  { key: "checkin_id", description: "The 6-digit check-in ID used to order food" },
  { key: "wifi", description: "Wi-Fi name and password for the floor of the guest's room" },
  { key: "note", description: "The branch's welcome note" },
  { key: "checkin_time", description: "The branch's check-in time, for example 2:00 PM" },
  { key: "checkout_time", description: "The branch's check-out time, for example 11:00 AM" },
];

/** A value as it must appear in a link: spaces become +, anything else unsafe is percent-encoded. */
export const encodeForLink = (value: string): string => encodeURIComponent(value).replace(/%20/g, "+");

/**
 * Fills the placeholders. Inside a link (text starting http:// or https://) every value is made link-safe, with
 * + for spaces, and {hotel} after `outlet=` is the branch's code (`hotel_key`), because that is what the QR page
 * looks the branch up by. Outside links values are written as they are, spaces and all. A line made only of
 * placeholders that turn out empty (no Wi-Fi set, no note) is left out, so the message never has gaps.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    let hadPlaceholder = false;
    // Links first, so their placeholders get link treatment; the rest of the line is plain text.
    const filled = line
      .split(/(https?:\/\/[^\s]*)/)
      .map((part, index) => {
        const inLink = index % 2 === 1;
        return part.replace(/\{(\w+)\}/g, (match, key: string, offset: number) => {
          if (!(key in values)) return match;
          hadPlaceholder = true;
          if (!inLink) return values[key];
          const useBranchCode = key === "hotel" && part.slice(0, offset).endsWith("outlet=") && "hotel_key" in values;
          return encodeForLink(useBranchCode ? values.hotel_key : values[key]);
        });
      })
      .join("");
    if (hadPlaceholder && filled.trim() === "") continue;
    out.push(filled);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
