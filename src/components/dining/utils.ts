export const toNumber = (value: number | string | null | undefined, fallback = 0): number => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const normalizeText = (value: string): string =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export const shortOrderId = (id: string): string => id.slice(0, 8);

/** "Room 101" / "Table A1" from a stored location type + code. */
export const locationLabel = (type?: string | null, code?: string | null): string => {
  const kind = (type ?? "").toUpperCase();
  const noun = kind === "ROOM" || kind === "HOTEL_ROOM" ? "Room" : kind === "TABLE" ? "Table" : "";
  return [noun, code].filter(Boolean).join(" ");
};

export const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;
