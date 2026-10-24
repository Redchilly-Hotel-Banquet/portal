import { ApiError, apiPost } from "@/lib/apiClient";
import { getGuestSession, saveGuestSession, type GuestSession } from "@/lib/guestSession";
import { locationLabel } from "../utils";

export type LocationKind = "ROOM" | "TABLE";

export type LocationRequest = {
  code: string;
  type: LocationKind;
  outletId: string;
};

type ValidateResponse =
  | {
      valid: true;
      location: { id: string; code: string; type: string; outlet_id?: string };
      outlet?: { id: string; name?: string | null; location_key?: string | null } | null;
      booking?: {
        id?: string;
        booking_code?: string;
        status?: string;
        check_out_date?: string;
        guest_name?: string;
      } | null;
    }
  | { valid: false; message?: string }
  | { outlet: Array<{ id: string; location_key?: string }> };

export type LocationResult =
  | { ok: true; session: GuestSession; welcome: string; warning?: string }
  | { ok: false; message: string };

/** Query parameters a printed QR code may carry: ?room=101 or ?table=A1, plus &outlet=<key>. */
export function readLocationParams(params: { get(name: string): string | null }) {
  const room = params.get("room")?.trim() || null;
  const table = params.get("table")?.trim() || null;
  const outlet = params.get("outlet")?.trim() || null;
  const code = room || table;
  return {
    code,
    type: (room ? "ROOM" : "TABLE") as LocationKind,
    outletId: outlet,
    hasLocation: Boolean(code),
  };
}

/** Extracts room/table/outlet from the text of a scanned QR code (a URL, absolute or relative). */
export function parseScannedText(text: string): { code: string; type: LocationKind; outletId: string | null } | null {
  try {
    const url = new URL(text.trim(), window.location.origin);
    const parsed = readLocationParams(url.searchParams);
    return parsed.code ? { code: parsed.code, type: parsed.type, outletId: parsed.outletId } : null;
  } catch {
    return null;
  }
}

/** Validates a room/table with the server and, when valid, stores the guest session. */
export async function resolveLocation({ code, type, outletId }: LocationRequest): Promise<LocationResult> {
  try {
    const data = await apiPost<ValidateResponse, LocationRequest>("/public/locations/validate", { code, type, outletId });

    if (!("valid" in data) || !data.valid) {
      return { ok: false, message: ("message" in data && data.message) || "We could not find that room or table." };
    }

    const { location, outlet } = data;
    const resolvedOutletId = location.outlet_id ?? outletId;

    const existing = getGuestSession();
    const reuse = Boolean(existing && existing.outletId === resolvedOutletId && existing.id === location.id);
    const booking = type === "ROOM" ? data.booking ?? null : null;

    const session: GuestSession = {
      id: location.id,
      code: location.code,
      type: location.type as GuestSession["type"],
      outletId: resolvedOutletId,
      outletName: outlet?.name ?? outlet?.id ?? resolvedOutletId,
      assignedAt: new Date().toISOString(),
      bookingId: booking?.id || (reuse ? existing?.bookingId : undefined),
      bookingCode: booking?.booking_code || (reuse ? existing?.bookingCode : undefined),
      bookingStatus: booking?.status || (reuse ? existing?.bookingStatus : undefined),
      checkOutDate: booking?.check_out_date || (reuse ? existing?.checkOutDate : undefined),
    };
    saveGuestSession(session);

    const place = locationLabel(location.type, location.code);
    return {
      ok: true,
      session,
      welcome: booking?.guest_name ? `Welcome, ${booking.guest_name}. ${place} is confirmed.` : `${place} is confirmed.`,
      warning: type === "ROOM" && !booking && !reuse ? "No active booking found for this room. Please check with the front desk." : undefined,
    };
  } catch (error) {
    return { ok: false, message: error instanceof ApiError || error instanceof Error ? error.message : "Unable to validate location" };
  }
}
