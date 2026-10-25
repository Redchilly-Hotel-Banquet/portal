/**
 * Indian mobile numbers, as the hotel stores them: 10 digits, no country code. A leading +91, 91 or 0
 * is dropped. Returns null when the value is not a usable 10-digit mobile number.
 */
export const tenDigitPhone = (raw: unknown): string | null => {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

/** Blank is fine (the number is optional); anything typed must be a valid mobile number. */
export const optionalPhoneError = (raw: string): string | null =>
  !raw.trim() || tenDigitPhone(raw) ? null : "Enter a 10-digit mobile number, or leave it blank.";

/** wa.me-style link that opens WhatsApp to this number with the message filled in. */
export const whatsappLink = (phone: string, text: string): string | null => {
  const number = tenDigitPhone(phone);
  return number ? `https://api.whatsapp.com/send/?phone=%2B91${number}&text=${encodeURIComponent(text)}` : null;
};
