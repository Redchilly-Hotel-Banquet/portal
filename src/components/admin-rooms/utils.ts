import type { OutletRef, PricingRule, RoomRecord, RuleState } from "./types";

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Resolves a room's outlet to the human-readable location key used in guest QR links. */
export function resolveOutletKey(room: Pick<RoomRecord, "outlet_id">, outlets: OutletRef[]): string {
  const raw = room.outlet_id.trim();
  if (!raw) return "";
  const match = outlets.find((o) => o.location_key === raw || o.id === raw);
  return (match?.location_key ?? raw).trim();
}

/** Guest-facing URL encoded in the QR: rooms use ?room=, tables use ?table=. */
export function buildQrUrl(origin: string, room: RoomRecord, outletKey: string): string {
  const key = room.type === "TABLE" ? "table" : "room";
  const qs = new URLSearchParams({ [key]: room.code.trim(), outlet: outletKey });
  return `${origin}/qr?${qs.toString()}`;
}

export function qrLabel(room: RoomRecord, outletKey: string): string {
  const prefix = room.type === "TABLE" ? "Table" : "Room";
  return outletKey ? `${prefix} ${room.code} · ${outletKey}` : `${prefix} ${room.code}`;
}

export function qrFileName(room: RoomRecord, outletKey: string): string {
  const key = room.type === "TABLE" ? "table" : "room";
  return `qr-${slugify(`${key}-${room.code}-outlet-${outletKey || "outlet"}`)}.png`;
}

export const todayInput = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

export function ruleState(rule: PricingRule, now = new Date()): RuleState {
  const start = rule.start_date ? new Date(rule.start_date) : null;
  const end = rule.end_date ? new Date(rule.end_date) : null;
  if (start && !Number.isNaN(start.getTime()) && start > now) return "scheduled";
  if (end && !Number.isNaN(end.getTime())) {
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    if (endOfDay < now) return "expired";
  }
  return "active";
}

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
