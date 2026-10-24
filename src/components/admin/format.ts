const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
const numberFmt = new Intl.NumberFormat("en-IN");

const toDate = (value: string | number | Date | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatINR = (value: number | string | null | undefined): string => {
  const n = Number(value);
  return Number.isFinite(n) ? inr.format(n) : "-";
};

export const formatNumber = (value: number | null | undefined): string =>
  typeof value === "number" && Number.isFinite(value) ? numberFmt.format(value) : "-";

export const formatDate = (value: string | number | Date | null | undefined): string => {
  const d = toDate(value);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";
};

export const formatDateTime = (value: string | number | Date | null | undefined): string => {
  const d = toDate(value);
  return d
    ? d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "-";
};

const rtf = new Intl.RelativeTimeFormat("en-IN", { numeric: "auto" });

export const relativeTime = (value: string | number | Date | null | undefined, now: number = Date.now()): string => {
  const d = toDate(value);
  if (!d) return "-";
  const seconds = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return formatDate(d);
};
