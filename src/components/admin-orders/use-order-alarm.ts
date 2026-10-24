"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addAcked,
  getAcked,
  startSiren,
  stopSiren,
  unlockAudio,
  type AlarmHandle,
} from "./alarm";
import type { AdminOrder } from "./types";

type WakeLockSentinelLike = { release?: () => Promise<void>; addEventListener: (t: "release", cb: () => void) => void };
type WakeLockNavigator = Navigator & { wakeLock?: { request?: (type: "screen") => Promise<WakeLockSentinelLike> } };

/**
 * Owns the new-order alarm: audio unlock, siren + HTMLAudio fallback,
 * repair on focus/visibility, browser notifications and acknowledgement.
 */
export function useOrderAlarm(orders: AdminOrder[] | undefined, audioRef: React.RefObject<HTMLAudioElement>) {
  const alarmRef = useRef<AlarmHandle | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);

  const playFallback = useCallback(async () => {
    try {
      const el = audioRef.current;
      if (el) {
        el.volume = 1;
        await el.play();
      }
    } catch {
      // autoplay rejected; the siren oscillator still covers desktop browsers
    }
  }, [audioRef]);

  const enableSound = useCallback(async () => {
    const ok = await unlockAudio(alarmRef);
    try {
      const el = audioRef.current;
      if (el) {
        el.loop = true;
        el.volume = 0; // prime muted inside the user gesture
        await el.play();
        el.pause();
      }
    } catch {
      // priming is best effort
    }
    setAudioEnabled(ok);

    try {
      const wl = await (navigator as WakeLockNavigator).wakeLock?.request?.("screen");
      if (wl) {
        wakeLockRef.current = wl;
        wl.addEventListener("release", () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // wake lock unsupported or denied
    }

    if (ok && pending.length > 0) {
      startSiren(alarmRef);
      await playFallback();
    }
  }, [audioRef, pending.length, playFallback]);

  /** Repair audio when the tab regains focus. */
  useEffect(() => {
    const repair = async () => {
      if (!audioEnabled) return;
      const ok = await unlockAudio(alarmRef);
      if (!ok) return;
      if (open && pending.length > 0) {
        stopSiren(alarmRef);
        startSiren(alarmRef);
        await playFallback();
      }
    };
    const handler = () => void repair();
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [audioEnabled, open, pending.length, playFallback]);

  /** Detect un-acknowledged PENDING orders from each poll. */
  useEffect(() => {
    if (!orders) return;
    const acked = getAcked();
    const fresh = orders.filter((o) => o.status === "PENDING" && !acked.has(o._id));
    if (fresh.length === 0) return;

    setPending(fresh.map((o) => o._id));
    setOpen(true);

    if (audioEnabled) {
      startSiren(alarmRef);
      void playFallback();
    }

    if (typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification("New order received", { body: `${fresh.length} new order(s) awaiting acceptance.`, silent: true });
      } else if (Notification.permission !== "denied") {
        void Notification.requestPermission();
      }
    }
  }, [orders, audioEnabled, playFallback]);

  const acknowledge = useCallback(() => {
    addAcked(pending);
    setPending([]);
    setOpen(false);
    stopSiren(alarmRef);
    try {
      const el = audioRef.current;
      if (el) {
        el.volume = 0;
        el.pause();
        el.currentTime = 0;
      }
    } catch {
      // ignore
    }
  }, [audioRef, pending]);

  /** Release everything on unmount only. */
  useEffect(() => {
    const audio = audioRef;
    return () => {
      void wakeLockRef.current?.release?.();
      stopSiren(alarmRef);
      try {
        audio.current?.pause();
      } catch {
        // ignore
      }
    };
  }, [audioRef]);

  return { audioEnabled, enableSound, alarmOpen: open, pendingIds: pending, acknowledge };
}
