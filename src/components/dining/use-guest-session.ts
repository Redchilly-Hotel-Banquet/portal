"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/hooks/useAccount";
import { apiGet } from "@/lib/apiClient";
import {
  GUEST_SESSION_EVENT,
  clearGuestSession,
  getGuestSession,
  saveGuestSession,
  type GuestSession,
} from "@/lib/guestSession";
import { USER_SESSION_EVENT } from "@/lib/userSession";

export type StayRoom = {
  id: string;
  code: string;
  outletId: string;
  outletName: string;
  bookingId: string;
  bookingCode: string;
  checkOutDate: string | null;
};

const toSession = (room: StayRoom): GuestSession => ({
  id: room.id,
  code: room.code,
  type: "ROOM",
  outletId: room.outletId,
  outletName: room.outletName,
  assignedAt: new Date().toISOString(),
  bookingId: room.bookingId,
  bookingCode: room.bookingCode,
  bookingStatus: "CHECKED_IN",
  checkOutDate: room.checkOutDate ?? undefined,
  source: "account",
});

/**
 * Reads the guest session after mount (never during render) and keeps it in sync with other tabs.
 *
 * A signed-in guest who is checked in and has a room assigned gets that room as their session
 * automatically, so they can order without scanning. A scanned QR code always takes precedence, and
 * signed-out visitors keep the QR flow. `ready` stays false until the session, including that stay
 * lookup, has been resolved, so the menu never flashes "browsing only" first.
 */
export function useGuestSession() {
  const account = useAccount();
  const [session, setSession] = useState<GuestSession | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [rooms, setRooms] = useState<StayRoom[]>([]);

  useEffect(() => {
    const sync = () => {
      setSession(getGuestSession());
      setLoaded(true);
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(GUEST_SESSION_EVENT, sync);
    window.addEventListener(USER_SESSION_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(GUEST_SESSION_EVENT, sync);
      window.removeEventListener(USER_SESSION_EVENT, sync);
    };
  }, []);

  const accountId = account?.id ?? null;
  // Only a missing or account-derived session is resolved from the stay; a scanned one is left alone.
  const resolvable = loaded && Boolean(accountId) && (!session || session.source === "account");
  const pending = resolvable && resolvedFor !== accountId;

  useEffect(() => {
    if (!loaded || account === undefined) return;

    if (!accountId) {
      setRooms([]);
      setResolvedFor(null);
      // Signed out: an account-derived room must not outlive the account.
      if (getGuestSession()?.source === "account") clearGuestSession();
      return;
    }
    const current = getGuestSession();
    if (current && current.source !== "account") return;

    let active = true;
    apiGet<{ stay: { rooms: StayRoom[] } | null }>("/me/stay", "user")
      .then((res) => {
        if (!active) return;
        const list = res.stay?.rooms ?? [];
        setRooms(list);
        if (list.length === 0) {
          if (current?.source === "account") clearGuestSession();
          return;
        }
        const chosen = list.find((room) => room.id === current?.id) ?? list[0];
        const next = toSession(chosen);
        if (!current || current.id !== next.id || current.bookingId !== next.bookingId) saveGuestSession(next);
      })
      .catch(() => {
        /* Offline or signed out elsewhere: fall back to the QR flow. */
      })
      .finally(() => {
        if (active) setResolvedFor(accountId);
      });
    return () => {
      active = false;
    };
    // The stay is looked up per signed-in account, not on every session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, accountId]);

  const update = useCallback((next: GuestSession) => {
    saveGuestSession(next);
    setSession(next);
  }, []);

  const clear = useCallback(() => {
    clearGuestSession();
    setSession(null);
  }, []);

  /** Switch between several assigned rooms (only relevant when the booking has more than one). */
  const chooseRoom = useCallback(
    (roomId: string) => {
      const room = rooms.find((entry) => entry.id === roomId);
      if (room) update(toSession(room));
    },
    [rooms, update],
  );

  return {
    session,
    ready: loaded && account !== undefined && !pending,
    update,
    clear,
    stayRooms: rooms,
    chooseRoom,
  };
}
