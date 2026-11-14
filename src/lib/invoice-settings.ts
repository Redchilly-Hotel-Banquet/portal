/**
 * What the printed invoice (guest folio) shows, how big its pictures are and which paper it is printed on, set for
 * every branch or for chosen branches (the same way check-in rules are).
 */
export type PaperSize = "A4" | "A5" | "Letter" | "Thermal80";

/** Sheet sizes in millimetres. A thermal roll is 80 mm wide and as long as the content needs. */
export const PAPER_SIZES: Record<PaperSize, { label: string; width: number; height: number | null; css: string }> = {
  A4: { label: "A4 (210 × 297 mm)", width: 210, height: 297, css: "A4" },
  A5: { label: "A5 (148 × 210 mm)", width: 148, height: 210, css: "A5" },
  Letter: { label: "Letter (216 × 279 mm)", width: 216, height: 279, css: "letter" },
  Thermal80: { label: "Thermal roll (80 mm wide)", width: 80, height: null, css: "80mm auto" },
};

/** Each detail the invoice can show. */
export type InvoiceShow = {
  branch_address: boolean;
  branch_phone: boolean;
  branch_email: boolean;
  gstin: boolean;
  folio_status: boolean;
  issued_date: boolean;
  billed_to: boolean;
  guest_phone: boolean;
  guest_email: boolean;
  booking_code: boolean;
  branch_name: boolean;
  stay_dates: boolean;
  guest_count: boolean;
  booked_on: boolean;
  checked_in_at: boolean;
  checked_out_at: boolean;
  room_details: boolean;
  col_requested_room: boolean;
  col_assigned_room: boolean;
  col_assigned_type: boolean;
  col_room_status: boolean;
  room_mismatch_note: boolean;
  requests: boolean;
  request_special: boolean;
  request_arrival: boolean;
  request_assistance: boolean;
  request_other: boolean;
  charge_qty: boolean;
  charge_rate: boolean;
  room_period: boolean;
  food_items: boolean;
  food_order_heading: boolean;
  gst_breakdown: boolean;
  gst_basis: boolean;
  gst_taxable: boolean;
  gst_cgst: boolean;
  gst_sgst: boolean;
  gst_total: boolean;
  pay_before_gst: boolean;
  pay_gst: boolean;
  pay_round_off: boolean;
  payments: boolean;
  balance_due: boolean;
  guest_verification: boolean;
  document_numbers: boolean;
  id_photos: boolean;
  signatures: boolean;
  terms: boolean;
  footer_note: boolean;
};

/** Places where empty lines can be added: after each part of the invoice. */
export type SpacerKey = "after_header" | "after_guest" | "after_rooms" | "after_requests" | "after_charges" | "after_gst" | "after_payable" | "after_verification";

export const SPACERS: ReadonlyArray<{ key: SpacerKey; label: string }> = [
  { key: "after_header", label: "After the branch heading" },
  { key: "after_guest", label: "After guest and booking" },
  { key: "after_rooms", label: "After room details" },
  { key: "after_requests", label: "After requests" },
  { key: "after_charges", label: "After the charges" },
  { key: "after_gst", label: "After the GST table" },
  { key: "after_payable", label: "After the amount payable" },
  { key: "after_verification", label: "After guests and verification (before the footer)" },
];

/** One empty line is this tall, in millimetres. */
export const LINE_MM = 5;
export const MAX_EMPTY_LINES = 20;

/** Which photos of a document type print. A type left out prints all of its photos. */
export type InvoiceDocumentChoice = { show: boolean; sides: boolean[] };

export type InvoiceSettings = {
  paper: PaperSize;
  margin_mm: number;
  show: InvoiceShow;
  /** Height each ID photo prints at. */
  id_photo_height_mm: number;
  signature_height_mm: number;
  /** How many guests share a row in "Guests and verification". */
  guests_per_row: 1 | 2 | 3;
  /** Empty lines (each LINE_MM tall) added after each part of the invoice. */
  spacers: Record<SpacerKey, number>;
  /** Space between two guests side by side. */
  guest_column_gap_mm: number;
  /** Extra empty lines between rows of guests. */
  guest_row_gap_lines: number;
  /** Extra empty lines between one guest's photos. */
  photo_gap_lines: number;
  /** Which document types print, and which of their photos, keyed by the stored document type. */
  documents: Record<string, InvoiceDocumentChoice>;
};

export const INVOICE_LIMITS = {
  margin_mm: [0, 30] as const,
  guest_column_gap_mm: [0, 60] as const,
  guest_row_gap_lines: [0, 10] as const,
  photo_gap_lines: [0, 10] as const,
  id_photo_height_mm: [15, 100] as const,
  signature_height_mm: [6, 40] as const,
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  paper: "A4",
  margin_mm: 12,
  show: {
    branch_address: true,
    branch_phone: true,
    branch_email: true,
    gstin: true,
    folio_status: true,
    issued_date: true,
    billed_to: true,
    guest_phone: true,
    guest_email: true,
    booking_code: true,
    branch_name: true,
    stay_dates: true,
    guest_count: true,
    booked_on: true,
    checked_in_at: true,
    checked_out_at: true,
    room_details: true,
    col_requested_room: true,
    col_assigned_room: true,
    col_assigned_type: true,
    col_room_status: true,
    room_mismatch_note: true,
    requests: true,
    request_special: true,
    request_arrival: true,
    request_assistance: true,
    request_other: true,
    charge_qty: true,
    charge_rate: true,
    room_period: true,
    food_items: true,
    food_order_heading: true,
    gst_breakdown: true,
    gst_basis: true,
    gst_taxable: true,
    gst_cgst: true,
    gst_sgst: true,
    gst_total: true,
    pay_before_gst: true,
    pay_gst: true,
    pay_round_off: true,
    payments: true,
    balance_due: true,
    guest_verification: true,
    document_numbers: true,
    id_photos: true,
    signatures: true,
    terms: true,
    footer_note: true,
  },
  id_photo_height_mm: 50,
  signature_height_mm: 16,
  guests_per_row: 2,
  spacers: { after_header: 0, after_guest: 0, after_rooms: 0, after_requests: 0, after_charges: 0, after_gst: 0, after_payable: 0, after_verification: 0 },
  guest_column_gap_mm: 3,
  guest_row_gap_lines: 0,
  photo_gap_lines: 0,
  documents: {},
};

/**
 * The invoice's sections for the settings screen, once each, in the order they are printed. A section can be switched
 * off as a whole (`master` is the one setting that does it; `all` switches every field in it), or its fields one by one.
 * A section with neither is always printed.
 */
export type InvoiceSection = {
  title: string;
  spacer?: SpacerKey;
  /** The setting that turns the whole section on or off. */
  master?: keyof InvoiceShow;
  /** The section's switch turns all of its fields on or off together. */
  all?: boolean;
  fields: ReadonlyArray<{ key: keyof InvoiceShow; label: string; hint: string }>;
};

export const INVOICE_FIELD_GROUPS: ReadonlyArray<InvoiceSection> = [
  {
    title: "Heading",
    spacer: "after_header",
    all: true,
    fields: [
      { key: "branch_address", label: "Branch address", hint: "The invoice address from the branch's settings." },
      { key: "branch_phone", label: "Branch phone", hint: "Shown under the address." },
      { key: "branch_email", label: "Branch email", hint: "Shown under the address." },
      { key: "gstin", label: "GST number", hint: "The branch's GSTIN, when it has one." },
      { key: "folio_status", label: "Status", hint: "The folio's status, for example Checked Out." },
      { key: "issued_date", label: "Date issued", hint: "The day and time the invoice was printed." },
    ],
  },
  {
    title: "Guest and booking",
    spacer: "after_guest",
    all: true,
    fields: [
      { key: "billed_to", label: "Billed to", hint: "The guest's name on the booking." },
      { key: "guest_phone", label: "Phone", hint: "The phone number on the booking." },
      { key: "guest_email", label: "Email", hint: "The email address on the booking." },
      { key: "booking_code", label: "Booking code", hint: "The code of the booking." },
      { key: "branch_name", label: "Branch", hint: "The branch the guest stayed at." },
      { key: "stay_dates", label: "Stay", hint: "Check-in and check-out dates and the number of nights." },
      { key: "guest_count", label: "Guests", hint: "How many guests stayed." },
      { key: "booked_on", label: "Booked on", hint: "When the booking was made." },
      { key: "checked_in_at", label: "Checked in", hint: "When the guest arrived." },
      { key: "checked_out_at", label: "Checked out", hint: "When the guest left." },
    ],
  },
  {
    title: "Room details",
    spacer: "after_rooms",
    master: "room_details",
    fields: [
      { key: "col_requested_room", label: "Requested room", hint: "The room type asked for at booking." },
      { key: "col_assigned_room", label: "Assigned room no.", hint: "The room number the guest was given." },
      { key: "col_assigned_type", label: "Assigned type", hint: "The type of the room given." },
      { key: "col_room_status", label: "Status", hint: "As requested, different from request, and so on." },
      { key: "room_mismatch_note", label: "Note when the type differs", hint: "The line under the table when the room given is not the type requested." },
    ],
  },
  {
    title: "Requests",
    spacer: "after_requests",
    master: "requests",
    fields: [
      { key: "request_special", label: "Booking special requests", hint: "What the guest asked for when booking." },
      { key: "request_arrival", label: "Expected arrival", hint: "The arrival time given at check-in." },
      { key: "request_assistance", label: "Special assistance", hint: "Whether the guest needed assistance, and what." },
      { key: "request_other", label: "Other requests at check-in", hint: "Anything else noted at check-in." },
    ],
  },
  {
    title: "Charges",
    spacer: "after_charges",
    fields: [
      { key: "charge_qty", label: "Quantity column", hint: "Nights or number of items." },
      { key: "charge_rate", label: "Rate column", hint: "The price of one night or one item." },
      { key: "room_period", label: "Dates under each room", hint: "The nights a room was used, when the stay moved or was extended." },
      { key: "food_items", label: "Each food order", hint: "List every dish. Off shows only the food total." },
      { key: "food_order_heading", label: "Order number and time", hint: "The line above each food order's dishes." },
    ],
  },
  {
    title: "GST",
    spacer: "after_gst",
    master: "gst_breakdown",
    fields: [
      { key: "gst_basis", label: "How the rate was decided", hint: "The small line under each charge, for example the room tariff band." },
      { key: "gst_taxable", label: "Taxable value column", hint: "The amount the tax is worked out on." },
      { key: "gst_cgst", label: "CGST column", hint: "Central GST for each charge." },
      { key: "gst_sgst", label: "SGST column", hint: "State GST for each charge." },
      { key: "gst_total", label: "Total GST column", hint: "CGST and SGST together." },
    ],
  },
  {
    title: "Amount payable",
    spacer: "after_payable",
    fields: [
      { key: "pay_before_gst", label: "Total before GST", hint: "The charges before tax." },
      { key: "pay_gst", label: "GST added", hint: "The tax added, with the CGST and SGST split." },
      { key: "pay_round_off", label: "Round off", hint: "Shown only when the total was rounded." },
      { key: "payments", label: "Payments received", hint: "Each payment taken. The total payable is always shown." },
      { key: "balance_due", label: "Balance due", hint: "What is still owed after payments." },
    ],
  },
  {
    title: "Guests and verification",
    spacer: "after_verification",
    master: "guest_verification",
    fields: [
      { key: "document_numbers", label: "Document numbers", hint: "The number on each guest's ID." },
      { key: "id_photos", label: "ID photos", hint: "Every photo of each guest's identity document." },
      { key: "signatures", label: "Signatures", hint: "Each guest's signature, with the date." },
    ],
  },
  {
    title: "Footer",
    all: true,
    fields: [
      { key: "terms", label: "Terms and notes", hint: "The branch's terms text." },
      { key: "footer_note", label: "Closing line", hint: "The thank-you line at the very bottom." },
    ],
  },
];

const clamp = (value: unknown, [min, max]: readonly [number, number], fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export const normaliseInvoiceSettings = (value: unknown): InvoiceSettings => {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, any>;
  const show = { ...DEFAULT_INVOICE_SETTINGS.show };
  // Settings saved when some switches covered several details still mean the same thing.
  const earlier: Record<string, Array<keyof InvoiceShow>> = {
    branch_contact: ["branch_phone", "branch_email"],
    status_and_date: ["folio_status", "issued_date"],
    stay_times: ["booked_on", "checked_in_at", "checked_out_at"],
  };
  for (const [old, keys] of Object.entries(earlier)) if (typeof source.show?.[old] === "boolean") for (const key of keys) show[key] = source.show[old];
  for (const key of Object.keys(show) as Array<keyof InvoiceShow>) {
    if (typeof source.show?.[key] === "boolean") show[key] = source.show[key];
  }
  const paper = (Object.keys(PAPER_SIZES) as PaperSize[]).includes(source.paper) ? (source.paper as PaperSize) : DEFAULT_INVOICE_SETTINGS.paper;
  const perRow = Number(source.guests_per_row);
  const spacers = { ...DEFAULT_INVOICE_SETTINGS.spacers };
  for (const key of Object.keys(spacers) as SpacerKey[]) spacers[key] = clamp(source.spacers?.[key], [0, MAX_EMPTY_LINES], 0);
  const documents: Record<string, InvoiceDocumentChoice> = {};
  const rawDocuments = (source.documents && typeof source.documents === "object" ? source.documents : {}) as Record<string, any>;
  for (const [type, choice] of Object.entries(rawDocuments).slice(0, 12)) {
    const name = type.trim().slice(0, 60);
    if (!name) continue;
    documents[name] = { show: choice?.show !== false, sides: Array.isArray(choice?.sides) ? choice.sides.slice(0, 4).map((s: unknown) => s !== false) : [] };
  }
  return {
    spacers,
    guest_column_gap_mm: clamp(source.guest_column_gap_mm, INVOICE_LIMITS.guest_column_gap_mm, DEFAULT_INVOICE_SETTINGS.guest_column_gap_mm),
    guest_row_gap_lines: clamp(source.guest_row_gap_lines, INVOICE_LIMITS.guest_row_gap_lines, 0),
    photo_gap_lines: clamp(source.photo_gap_lines, INVOICE_LIMITS.photo_gap_lines, 0),
    documents,
    paper,
    margin_mm: clamp(source.margin_mm, INVOICE_LIMITS.margin_mm, DEFAULT_INVOICE_SETTINGS.margin_mm),
    show,
    id_photo_height_mm: clamp(source.id_photo_height_mm, INVOICE_LIMITS.id_photo_height_mm, DEFAULT_INVOICE_SETTINGS.id_photo_height_mm),
    signature_height_mm: clamp(source.signature_height_mm, INVOICE_LIMITS.signature_height_mm, DEFAULT_INVOICE_SETTINGS.signature_height_mm),
    guests_per_row: perRow === 1 || perRow === 3 ? perRow : 2,
  };
};

/** A set covers every branch (`outlets` empty) or the branches listed; a branch uses its own set, else the every-branch set. */
export type InvoiceSettingSet = { outlets: string[]; settings: InvoiceSettings };

export const normaliseInvoiceSets = (value: unknown): InvoiceSettingSet[] => {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((row) => {
    const source = (row ?? {}) as Record<string, unknown>;
    const outlets = Array.isArray(source.outlets) ? source.outlets.map((o) => (typeof o === "string" ? o.trim() : "")).filter(Boolean) : [];
    return { outlets: Array.from(new Set(outlets)), settings: normaliseInvoiceSettings(source.settings) };
  });
};

export const invoiceSetsError = (sets: InvoiceSettingSet[], knownOutlets?: string[]): string | null => {
  if (sets.filter((set) => set.outlets.length === 0).length > 1) return "Only one set of invoice settings can cover every branch.";
  const seen = new Set<string>();
  for (const set of sets) {
    for (const outlet of set.outlets) {
      if (knownOutlets && !knownOutlets.includes(outlet)) return `An invoice setting names a branch that does not exist (${outlet}).`;
      if (seen.has(outlet)) return `${outlet} is in more than one set of invoice settings. A branch can only follow one.`;
      seen.add(outlet);
    }
  }
  return null;
};

export const invoiceSettingsForOutlet = (sets: InvoiceSettingSet[], outletKey?: string | null): InvoiceSettings =>
  (outletKey ? sets.find((set) => set.outlets.includes(outletKey)) : undefined)?.settings ??
  sets.find((set) => set.outlets.length === 0)?.settings ??
  DEFAULT_INVOICE_SETTINGS;

/** Whether a guest's document of this type prints at all, and whether its photo number `side` (0 is the first) does. */
export const documentPrints = (settings: InvoiceSettings, type: string): boolean => settings.documents[type]?.show !== false;
export const documentSidePrints = (settings: InvoiceSettings, type: string, side: number): boolean =>
  documentPrints(settings, type) && settings.documents[type]?.sides?.[side] !== false;
