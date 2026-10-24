import type { QueryClient } from "@tanstack/react-query";
import { USER_SESSION_EVENT } from "./userSession";
import { GUEST_SESSION_EVENT } from "./guestSession";

/** The only thing that survives sign-out: the visitor's light/dark preference (next-themes). */
const KEEP = new Set(["theme"]);

const wipe = (storage: Storage | undefined) => {
  if (!storage) return;
  try {
    for (const key of Object.keys(storage)) if (!KEEP.has(key)) storage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was stored */
  }
};

/**
 * Signing out removes everything remembered about the person on this device: both sessions, the
 * room/table they were ordering to, the cart, drafts and every cached API result. Only the theme stays.
 */
export function clearAllUserData(queryClient?: QueryClient) {
  if (typeof window === "undefined") return;
  wipe(window.localStorage);
  wipe(window.sessionStorage);
  queryClient?.clear();
  window.dispatchEvent(new Event(USER_SESSION_EVENT));
  window.dispatchEvent(new Event(GUEST_SESSION_EVENT));
}
