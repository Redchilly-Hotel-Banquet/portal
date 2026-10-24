export type GuestSession = {
  id: string;
  code: string;
  type: "ROOM" | "TABLE";
  outletId: string;
  outletName?: string | null;
  assignedAt?: string;
  bookingId?: string;
  bookingCode?: string;
  bookingStatus?: string;
  checkOutDate?: string;
  /** "account" when derived from the signed-in guest's checked-in room rather than a scanned QR code. */
  source?: "account";
};

const STORAGE_KEY = "guestLocation";
export const GUEST_SESSION_EVENT = "rc-guest-session";

const notify = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GUEST_SESSION_EVENT));
};

const safeSetItem = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    /* no-op */
  }
};

const safeRemoveItem = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch {
    /* no-op */
  }
};

const parseSession = (raw: string | null): GuestSession | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GuestSession;
  } catch {
    return null;
  }
};

export const getGuestSession = (): GuestSession | null => {
  if (typeof window === "undefined") return null;

  const fromSession = parseSession(sessionStorage.getItem(STORAGE_KEY));
  if (fromSession) return fromSession;

  const fromLocalRaw = localStorage.getItem(STORAGE_KEY);
  const fromLocal = parseSession(fromLocalRaw);
  if (fromLocal && fromLocalRaw) {
    safeSetItem(sessionStorage, STORAGE_KEY, fromLocalRaw);
    return fromLocal;
  }

  return null;
};

export const saveGuestSession = (session: GuestSession) => {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(session);
  safeSetItem(sessionStorage, STORAGE_KEY, payload);
  safeSetItem(localStorage, STORAGE_KEY, payload);
  notify();
};

export const clearGuestSession = () => {
  if (typeof window === "undefined") return;
  safeRemoveItem(sessionStorage, STORAGE_KEY);
  safeRemoveItem(localStorage, STORAGE_KEY);
  notify();
};
