export type OutletLocation = {
  id: string;
  locationKey: string;
  name: string;
  address?: string;
  mapUrl?: string;
  phone?: string;
  email?: string;
};

type RawOutlet = Record<string, unknown>;

const str = (...values: unknown[]): string | undefined => {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
};

export function normaliseOutlets(response: unknown): OutletLocation[] {
  const list: unknown = Array.isArray(response) ? response : (response as { outlets?: unknown } | null)?.outlets;
  if (!Array.isArray(list)) return [];
  return (list as RawOutlet[])
    .map((raw, index) => {
      const locationKey = str(raw.location_key, raw.code, raw.outlet_id) ?? "";
      const id = str(raw.id, raw._id) ?? (locationKey || `outlet-${index}`);
      return {
        id,
        locationKey,
        name: str(raw.name, raw.display_name) ?? locationKey,
        address: str(raw.address, raw.address_line),
        mapUrl: str(raw.google_maps_url, raw.map_url, raw.maps_url),
        phone: str(raw.contact_number, raw.contact, raw.phone),
        email: str(raw.contact_email, raw.email),
      } satisfies OutletLocation;
    })
    .filter((o) => o.locationKey);
}

export function toMapEmbedSrc(url: string): string {
  if (/^https:\/\/www\.google\.com\/maps\/embed/i.test(url) || url.includes("output=embed")) return url;
  return `https://www.google.com/maps?q=${encodeURIComponent(url)}&output=embed`;
}
