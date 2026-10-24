export type Branch = {
  id: string;
  location_key: string;
  name: string;
  address: string;
  contact_number: string;
  contact_email: string;
  google_maps_url: string;
  sort_order: number | null;
  is_active: boolean;
};

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

export function toBranch(raw: Record<string, unknown>): Branch | null {
  const id = str(raw._id) || str(raw.id);
  const location_key = str(raw.location_key).trim();
  if (!id || !location_key) return null;
  const order = raw.sort_order === null || raw.sort_order === undefined || raw.sort_order === "" ? NaN : Number(raw.sort_order);
  return {
    id,
    location_key,
    name: str(raw.name),
    address: str(raw.address),
    contact_number: str(raw.contact_number),
    contact_email: str(raw.contact_email),
    google_maps_url: str(raw.google_maps_url),
    sort_order: Number.isFinite(order) ? order : null,
    is_active: raw.is_active !== false,
  };
}
