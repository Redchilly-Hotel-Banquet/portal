export type RoomKind = "ROOM" | "TABLE";

export type RoomRecord = {
  id: string;
  code: string;
  type: RoomKind;
  outlet_id: string;
  level: string;
  room_type: string;
  occupancy: number | null;
  price_per_night: number;
  amenities: string[];
  is_active: boolean;
};

/** Payload accepted by /api/admin/rooms/manage for create and update. */
export type RoomPayload = {
  code: string;
  type: RoomKind;
  outlet_id: string;
  level: string;
  room_type?: string;
  occupancy?: number;
  price_per_night: number;
  amenities: string[];
  is_active: boolean;
};

export type OutletRef = { id: string; location_key: string };

export type PricingMode = "PERCENT" | "FIXED";

export type PricingRule = {
  id: string;
  outlet_id: string;
  room_ids: string[];
  mode: PricingMode;
  percent_increase: number;
  fixed_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string;
};

export type PricingRulePayload = {
  outlet_id: string;
  room_ids: string[];
  mode: PricingMode;
  percent_increase: number;
  fixed_rate?: number;
  start_date: string;
  end_date?: string;
  notes: string;
};

export type RuleState = "active" | "scheduled" | "expired";

type RawRecord = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function toRoomRecord(raw: RawRecord): RoomRecord | null {
  const id = str(raw.id) || str(raw._id);
  if (!id) return null;
  const kind = str(raw.type).toUpperCase();
  return {
    id,
    code: str(raw.code),
    type: kind.includes("TABLE") ? "TABLE" : "ROOM",
    outlet_id: str(raw.outlet_id),
    level: str(raw.level),
    room_type: str(raw.room_type),
    occupancy: num(raw.occupancy),
    price_per_night: num(raw.price_per_night) ?? 0,
    amenities: Array.isArray(raw.amenities) ? raw.amenities.map(str).filter(Boolean) : [],
    is_active: raw.is_active !== false,
  };
}

export function toPricingRule(raw: RawRecord): PricingRule | null {
  const id = str(raw.id) || str(raw._id);
  if (!id) return null;
  return {
    id,
    outlet_id: str(raw.outlet_id),
    room_ids: Array.isArray(raw.room_ids) ? raw.room_ids.map(str).filter(Boolean) : [],
    mode: str(raw.mode).toUpperCase() === "FIXED" ? "FIXED" : "PERCENT",
    percent_increase: num(raw.percent_increase) ?? 0,
    fixed_rate: num(raw.fixed_rate),
    start_date: str(raw.start_date) || null,
    end_date: str(raw.end_date) || null,
    notes: str(raw.notes),
  };
}
