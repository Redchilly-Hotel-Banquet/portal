import { COUNTRIES, DEFAULT_COUNTRY, countryForDigits, type Country } from "./countries";

/**
 * Phone numbers are stored with their country dial code, as "+" and digits only: "+919876543210".
 * Numbers typed or saved in the old style (10 Indian digits, "+91 …", "0…") are read as India.
 */
export type ParsedPhone = { country: Country; dial: string; national: string; e164: string };

const digitsOf = (raw: unknown) => String(raw ?? "").replace(/\D/g, "");

/** An Indian mobile number: 10 digits starting 6 to 9. Other countries just need a plausible length. */
const nationalOk = (country: Country, national: string): boolean =>
  country.dial === "91" ? /^[6-9]\d{9}$/.test(national) : /^\d{4,14}$/.test(national) && country.dial.length + national.length <= 15;

/** Reads a phone number in any of the usual shapes. Null when it is not a usable number. */
export const parsePhone = (raw: unknown, fallback: Country = DEFAULT_COUNTRY): ParsedPhone | null => {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let digits = digitsOf(text);
  let country: Country | null = null;
  if (text.startsWith("+") || text.startsWith("00")) {
    if (text.startsWith("00")) digits = digits.slice(2);
    country = countryForDigits(digits);
    if (!country) return null;
    digits = digits.slice(country.dial.length);
  } else if (fallback.dial === "91" && digits.length === 12 && digits.startsWith("91")) {
    country = fallback;
    digits = digits.slice(2);
  } else {
    country = fallback;
    if (digits.startsWith("0")) digits = digits.slice(1);
  }
  if (!nationalOk(country, digits)) return null;
  return { country, dial: country.dial, national: digits, e164: `+${country.dial}${digits}` };
};

/** "+919876543210", or null when the number is not usable. */
export const normalisePhone = (raw: unknown, fallback?: Country): string | null => parsePhone(raw, fallback)?.e164 ?? null;

/** Blank is fine (the number is optional); anything typed must be a valid number for its country. */
export const optionalPhoneError = (raw: string): string | null => {
  if (!String(raw ?? "").trim()) return null;
  const text = String(raw);
  const parsed = parsePhone(text);
  if (parsed) return null;
  const typed = text.startsWith("+") ? countryForDigits(digitsOf(text)) : DEFAULT_COUNTRY;
  return typed?.dial === "91" ? "Enter a 10-digit mobile number, or leave it blank." : "Enter a valid phone number, or leave it blank.";
};

/** "+91 98765 43210" for display. Anything that is not a known number is shown as it was typed. */
export const formatPhone = (raw: unknown): string => {
  const parsed = parsePhone(raw);
  if (!parsed) return String(raw ?? "");
  const n = parsed.national;
  const grouped = n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n.replace(/(\d{3,4})(?=\d)/g, "$1 ");
  return `+${parsed.dial} ${grouped}`;
};

/** wa.me-style link that opens WhatsApp to this number with the message filled in. */
export const whatsappLink = (phone: string, text: string): string | null => {
  const parsed = parsePhone(phone);
  return parsed ? `https://api.whatsapp.com/send/?phone=%2B${parsed.dial}${parsed.national}&text=${encodeURIComponent(text)}` : null;
};

/** True when two stored numbers are the same number (either may be in the old style). */
export const samePhone = (a: unknown, b: unknown): boolean => {
  const x = normalisePhone(a);
  return Boolean(x) && x === normalisePhone(b);
};

export { COUNTRIES };
