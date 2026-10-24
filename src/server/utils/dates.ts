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