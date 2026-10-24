export type UserAccount = {
  id: string;
  name: string;
  email?: string;
  roles: string[];
  outlets: string[];
};

const TOKEN_KEY = "userJwt";
const ACCOUNT_KEY = "userAccount";
export const USER_SESSION_EVENT = "rc-user-session";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const notify = () => window.dispatchEvent(new Event(USER_SESSION_EVENT));

export const saveUserSession = (token: string, account: UserAccount) => {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    /* storage unavailable: the user simply stays signed out */
  }
  notify();
};

export const clearUserSession = () => {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* no-op */
  }
  notify();
};

export const getUserToken = (): string | null => read(TOKEN_KEY);

export const getUserAccount = (): UserAccount | null => {
  const raw = read(ACCOUNT_KEY);
  if (!raw || !getUserToken()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserAccount>;
    if (typeof parsed?.id !== "string" || typeof parsed.name !== "string") return null;
    return {
      id: parsed.id,
      name: parsed.name,
      email: typeof parsed.email === "string" ? parsed.email : undefined,
      roles: Array.isArray(parsed.roles) ? parsed.roles.filter((r): r is string => typeof r === "string") : [],
      outlets: Array.isArray(parsed.outlets) ? parsed.outlets.filter((o): o is string => typeof o === "string") : [],
    };
  } catch {
    return null;
  }
};
