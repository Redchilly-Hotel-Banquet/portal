/** Which details reception must collect when checking a guest in from the admin page. The guest's name is always needed. */
export type CheckinRules = {
  document_number: boolean;
  document_photo: boolean;
  /** Needed to mark a guest checked in; a check-in can still be saved as a draft without it. */
  signature: boolean;
  /** A phone number, from the booking contact or any guest. */
  contact_phone: boolean;
  /** An email address for the booking contact. */
  contact_email: boolean;
  /** At least one of the two: a phone number or an email. Satisfied by either. */
  contact_either: boolean;
  /** At least one room assigned before marking checked in. */
  room: boolean;
};

export const DEFAULT_CHECKIN_RULES: CheckinRules = {
  document_number: false,
  document_photo: true,
  signature: true,
  contact_phone: true,
  contact_email: false,
  contact_either: false,
  room: true,
};

export const CHECKIN_RULE_FIELDS: ReadonlyArray<{ key: keyof CheckinRules; label: string; hint: string }> = [
  { key: "document_number", label: "Document number", hint: "The number on the guest's ID." },
  { key: "document_photo", label: "ID photo", hint: "A photo of the guest's identity document." },
  { key: "signature", label: "Signature", hint: "Needed to mark the guest as checked in." },
  { key: "contact_phone", label: "Phone number", hint: "The booking contact's or any guest's number, needed to mark the guest as checked in." },
  { key: "contact_email", label: "Email address", hint: "The booking contact's email, needed to mark the guest as checked in." },
  { key: "contact_either", label: "Phone or email (either one)", hint: "At least one of the two, whichever the guest has. Only matters if both of the switches above are optional." },
  { key: "room", label: "Room assigned", hint: "At least one room allocated, needed to mark the guest as checked in." },
];

export const normaliseCheckinRules = (value: unknown): CheckinRules => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rules = { ...DEFAULT_CHECKIN_RULES };
  for (const key of Object.keys(rules) as Array<keyof CheckinRules>) {
    if (typeof source[key] === "boolean") rules[key] = source[key] as boolean;
  }
  return rules;
};
