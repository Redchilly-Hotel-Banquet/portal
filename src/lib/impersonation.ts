import { clearAdminSession, getAdminToken, getAdminUser, saveAdminSession, type AdminUser } from "./authSession";
import { getUserAccount, getUserToken, saveUserSession, type UserAccount } from "./userSession";

const KEY = "rcSwitchedFrom";
export const SWITCH_EVENT = "rc-switched-account";

type Original = { adminToken: string | null; adminUser: AdminUser | null; userToken: string | null; userAccount: UserAccount | null };

const read = (): Original | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Original) : null;
  } catch {
    return null;
  }
};

export const isSwitched = (): boolean => read() !== null;

/** Take on another account's session, remembering the super-owner's own so it can be restored. */
export const switchToAccount = (token: string, user: UserAccount) => {
  if (!read()) {
    try {
      const original: Original = { adminToken: getAdminToken(), adminUser: getAdminUser(), userToken: getUserToken(), userAccount: getUserAccount() };
      window.localStorage.setItem(KEY, JSON.stringify(original));
    } catch {
      /* storage unavailable: switching back will mean signing in again */
    }
  }
  saveUserSession(token, user);
  if (user.roles.length > 0) saveAdminSession(token, user);
  else clearAdminSession();
  window.dispatchEvent(new Event(SWITCH_EVENT));
};

export const switchBack = (): boolean => {
  const original = read();
  if (!original) return false;
  clearAdminSession();
  if (original.userToken && original.userAccount) saveUserSession(original.userToken, original.userAccount);
  if (original.adminToken && original.adminUser) saveAdminSession(original.adminToken, original.adminUser);
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new Event(SWITCH_EVENT));
  return true;
};
