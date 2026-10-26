export const startOfUTCDay = (date = new Date()): Date => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
};

export const endOfUTCDay = (date = new Date()): Date => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
};

export const nowUtc = (): Date => {
  return new Date();
};

const extractLastNames = (fullName: string) =>
  fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.toLowerCase());

export const matchesLastName = (fullName: string, probe: string) => {
  const quest = probe.trim().toLowerCase();
  if (!quest) return false;
  const parts = extractLastNames(fullName);
  if (!parts.length) return false;
  return parts.includes(quest);
};
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Start of the current trading day: the most recent 3 am India time. A late-night order still belongs to the
 * evening it was taken, and the kitchen's "today" and the dashboard's "orders today" use this same cut-off.
 * It is worked out in India time whatever timezone the server runs in (Vercel runs in UTC).
 */
export const businessDayStart = (now = new Date()): Date => {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  let start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 0, 0, 0);
  if (ist.getUTCHours() < 3) start -= 24 * 60 * 60 * 1000;
  return new Date(start - IST_OFFSET_MS);
};
