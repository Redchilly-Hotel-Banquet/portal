export type WifiFloorRow = { floor: string; wifi_name: string; wifi_password: string };

export type Branch = {
  id: string;
  location_key: string;
  name: string;
  address: string;
  contact_number: string;
  contact_email: string;
  google_maps_url: string;
  wifi_name: string;
  wifi_password: string;
  welcome_message: string;
  wifi_floors: WifiFloorRow[];
  /** Floors above the ground floor, set under Settings. null until set. */
  floors_max: number | null;
  legal_name: string;
  gstin: string;
  invoice_address: string;
  invoice_phone: string;
  invoice_email: string;
  invoice_terms: string;
  whatsapp_template: string;
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
    wifi_name: str(raw.wifi_name),
    wifi_password: str(raw.wifi_password),
    welcome_message: str(raw.welcome_message),
    legal_name: str(raw.legal_name),
    gstin: str(raw.gstin),
    invoice_address: str(raw.invoice_address),
    invoice_phone: str(raw.invoice_phone),
    invoice_email: str(raw.invoice_email),
    invoice_terms: str(raw.invoice_terms),
    whatsapp_template: str(raw.whatsapp_template),
    floors_max: Number.isInteger(raw.floors_max) ? Number(raw.floors_max) : null,
    wifi_floors: Array.isArray(raw.wifi_floors)
      ? (raw.wifi_floors as Record<string, unknown>[]).map((row) => ({ floor: str(row?.floor), wifi_name: str(row?.wifi_name), wifi_password: str(row?.wifi_password) }))
      : [],
    sort_order: Number.isFinite(order) ? order : null,
    is_active: raw.is_active !== false,
  };
}
