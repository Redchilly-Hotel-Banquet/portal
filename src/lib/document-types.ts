/**
 * The identity documents a guest can give at check-in, and how many photos each one needs (a card has a front and a
 * back; a passport has one photo page). Reception and the guest check-in form follow this list, which an
 * administrator can change under Settings.
 */
export type DocumentTypeConfig = {
  /** Stored on the guest's record. Never changes once chosen, so renaming the label is safe. */
  value: string;
  label: string;
  placeholder: string;
  /** One name per photo, in order: ["Front", "Back"]. */
  photos: string[];
  /** For each photo, whether it can be left out. Same length as `photos`. */
  optional: boolean[];
};

export const MAX_PHOTOS_PER_DOCUMENT = 4;
export const MAX_DOCUMENT_TYPES = 12;

export const DEFAULT_DOCUMENT_TYPES: DocumentTypeConfig[] = [
  { value: "Aadhar Card", label: "Aadhaar card", placeholder: "12-digit Aadhaar number", photos: ["Front", "Back"], optional: [false, false] },
  { value: "Driver's Licence", label: "Driving licence", placeholder: "Licence number", photos: ["Front", "Back"], optional: [false, false] },
  { value: "Passport", label: "Passport", placeholder: "Passport number", photos: ["Photo page"], optional: [false] },
  { value: "Voter ID", label: "Voter ID", placeholder: "Voter ID number", photos: ["Front", "Back"], optional: [false, false] },
  { value: "Other", label: "Other document", placeholder: "Document number", photos: ["Document"], optional: [false] },
];

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

/** A saved or submitted list, cleaned up. An empty or unusable list becomes the defaults. */
export const normaliseDocumentTypes = (raw: unknown): DocumentTypeConfig[] => {
  const seen = new Set<string>();
  const out: DocumentTypeConfig[] = [];
  for (const entry of Array.isArray(raw) ? raw.slice(0, MAX_DOCUMENT_TYPES) : []) {
    const source = (entry ?? {}) as Record<string, unknown>;
    const value = text(source.value ?? source.label, 60);
    const label = text(source.label, 60) || value;
    if (!value || seen.has(value.toLowerCase())) continue;
    // Keep each photo's "optional" flag with its own name when blank names are dropped.
    const rawPhotos = Array.isArray(source.photos) ? source.photos : [];
    const rawOptional = Array.isArray(source.optional) ? source.optional : [];
    const kept = rawPhotos.map((p, i) => ({ name: text(p, 30), optional: rawOptional[i] === true })).filter((p) => p.name).slice(0, MAX_PHOTOS_PER_DOCUMENT);
    seen.add(value.toLowerCase());
    out.push({
      value,
      label,
      placeholder: text(source.placeholder, 60) || "Document number",
      photos: kept.length ? kept.map((p) => p.name) : ["Photo"],
      optional: kept.length ? kept.map((p) => p.optional) : [false],
    });
  }
  return out.length ? out : DEFAULT_DOCUMENT_TYPES.map((d) => ({ ...d, photos: [...d.photos], optional: [...d.optional] }));
};

/** Problems with a list an administrator is about to save, in words; null when it is fine. */
export const documentTypesError = (raw: unknown): string | null => {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length === 0) return "Keep at least one document type.";
  const names = new Set<string>();
  for (const entry of list) {
    const source = (entry ?? {}) as Record<string, unknown>;
    const label = text(source.label ?? source.value, 60);
    if (!label) return "Every document type needs a name.";
    if (names.has(label.toLowerCase())) return `"${label}" is listed twice.`;
    names.add(label.toLowerCase());
    const photos = (Array.isArray(source.photos) ? source.photos : []).map((p) => text(p, 30)).filter(Boolean);
    if (photos.length < 1) return `${label} needs at least one photo.`;
    if (photos.length > MAX_PHOTOS_PER_DOCUMENT) return `${label} can have at most ${MAX_PHOTOS_PER_DOCUMENT} photos.`;
  }
  return null;
};

/** One photo a document asks for: what it is called and whether it can be left out. */
export type PhotoSpec = { label: string; optional: boolean };

/** The photos a document type asks for. An unknown type (an old record) needs one. */
export const photoSpecsFor = (types: DocumentTypeConfig[], value: string): PhotoSpec[] => {
  const type = types.find((t) => t.value === value);
  if (!type) return [{ label: "Photo", optional: false }];
  return type.photos.map((label, index) => ({ label, optional: type.optional?.[index] === true }));
};

export const photosFor = (types: DocumentTypeConfig[], value: string): string[] => photoSpecsFor(types, value).map((s) => s.label);

// The list the screens are using right now, so helpers that have no access to React state (completeness checks)
// know how many photos the chosen document needs. `useDocumentTypes` keeps it up to date.
let active: DocumentTypeConfig[] = DEFAULT_DOCUMENT_TYPES;
export const setActiveDocumentTypes = (types: DocumentTypeConfig[]) => {
  active = types;
};
export const photoCountFor = (value: string): number => photosFor(active, value).length;
export const photoSpecsOf = (value: string): PhotoSpec[] => photoSpecsFor(active, value);
