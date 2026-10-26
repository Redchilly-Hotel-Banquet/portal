/** The welcome message sent to guests on WhatsApp. Each branch can edit its own wording under Settings. */
export const DEFAULT_WHATSAPP_TEMPLATE = `Welcome to {hotel}, {guest}!

Room: {room}
Check-in ID: {checkin_id}
To order food to your room, scan the QR code in your room, choose Room and enter this ID. Please do not share it.

{wifi}

{note}`;

export const TEMPLATE_PLACEHOLDERS: Array<{ key: string; description: string }> = [
  { key: "guest", description: "The guest's name" },
  { key: "hotel", description: "The branch name" },
  { key: "room", description: "Room number or numbers" },
  { key: "checkin_id", description: "The 6-digit check-in ID used to order food" },
  { key: "wifi", description: "Wi-Fi name and password for the floor of the guest's room" },
  { key: "note", description: "The branch's welcome note" },
];

/**
 * Fills the placeholders. A line made only of placeholders that turn out empty (no Wi-Fi set, no note) is left
 * out, so the message never has gaps or half-sentences.
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  const lines = template.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    let hadPlaceholder = false;
    const filled = line.replace(/\{(\w+)\}/g, (match, key: string) => {
      if (!(key in values)) return match;
      hadPlaceholder = true;
      return values[key];
    });
    if (hadPlaceholder && filled.trim() === "") continue;
    out.push(filled);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
