import { DOCUMENT_TYPES } from "@/components/stay/checkin/types";
import { optionalPhoneError, tenDigitPhone } from "@/lib/phone";
import { DEFAULT_CHECKIN_RULES, type CheckinRules } from "@/lib/checkin-rules";
import type { CheckinContext, CheckinGuest } from "./types";

export const MAX_ADMIN_GUESTS = 20;
/** Vercel caps request bodies at ~4.5MB; stay safely below it. */
export const MAX_PAYLOAD_CHARS = 4_000_000;
export const DEFAULT_DOCUMENT_TYPE = DOCUMENT_TYPES[0].value;

export type AdminGuest = {
  key: string;
  fullName: string;
  /** Optional; lets reception send the stay details to this guest on WhatsApp. */
  phone: string;
  documentType: string;
  documentNumber: string;
  imageDataUrl: string;
  imageName: string;
  imageType: string;
  signature: string;
  /** Index in the saved record; null for guests added in this session. */
  savedIndex: number | null;
  savedImage: string;
  savedSignature: string;
};

export type GuestPayload = {
  fullName: string;
  phone: string;
  documentType: string;
  documentNumber: string;
  documentImageDataUrl?: string;
  documentImageName?: string;
  documentImageType?: string;
  signatureDataUrl?: string;
};

let counter = 0;
const nextKey = () => `guest-${Date.now()}-${counter++}`;

export const blankGuest = (): AdminGuest => ({
  key: nextKey(),
  fullName: "",
  phone: "",
  documentType: DEFAULT_DOCUMENT_TYPE,
  documentNumber: "",
  imageDataUrl: "",
  imageName: "",
  imageType: "",
  signature: "",
  savedIndex: null,
  savedImage: "",
  savedSignature: "",
});

export const bookedGuestCount = (context: CheckinContext): number =>
  Math.max(1, Number(context.booking?.number_of_guests) || 1);

export function seedGuests(context: CheckinContext): AdminGuest[] {
  const stored: CheckinGuest[] = context.checkinDetails?.guests ?? [];
  const bookedName = context.booking?.guest_name?.trim() ?? "";
  const guests: AdminGuest[] = stored.map((guest, index) => ({
    key: nextKey(),
    fullName: guest.full_name ?? "",
    phone: guest.phone ?? (index === 0 ? tenDigitPhone(context.booking?.guest_phone) ?? "" : ""),
    documentType: guest.document_type || DEFAULT_DOCUMENT_TYPE,
    documentNumber: guest.document_number ?? "",
    imageDataUrl: guest.document_image?.data_url ?? "",
    imageName: guest.document_image?.file_name ?? "",
    imageType: guest.document_image?.mime_type ?? "",
    signature: guest.signature_image?.data_url ?? "",
    savedIndex: index,
    savedImage: guest.document_image?.data_url ?? "",
    savedSignature: guest.signature_image?.data_url ?? "",
  }));
  // With nothing saved yet, start with a card per booked guest; reception removes the ones who do not arrive.
  // Once guests are saved, only they are shown.
  if (stored.length === 0) {
    while (guests.length < bookedGuestCount(context)) {
      guests.push(
        guests.length === 0
          ? { ...blankGuest(), fullName: bookedName, phone: tenDigitPhone(context.booking?.guest_phone) ?? "" }
          : blankGuest(),
      );
    }
  }
  return guests;
}

/** Enough to save: a name, and whatever Settings says must be captured. The signature is only needed to finish. */
export const hasDetails = (guest: AdminGuest, rules: CheckinRules = DEFAULT_CHECKIN_RULES): boolean =>
  !optionalPhoneError(guest.phone) &&
  Boolean(guest.fullName.trim()) &&
  (!rules.document_number || Boolean(guest.documentNumber.trim())) &&
  (!rules.document_photo || Boolean(guest.imageDataUrl));

export const isGuestComplete = (guest: AdminGuest, rules: CheckinRules = DEFAULT_CHECKIN_RULES): boolean =>
  hasDetails(guest, rules) && (!rules.signature || Boolean(guest.signature));

export type Completeness = "complete" | "missing-details" | "missing-photo" | "missing-signature";

export function guestStatus(guest: AdminGuest, rules: CheckinRules = DEFAULT_CHECKIN_RULES): Completeness {
  if (!guest.fullName.trim() || (rules.document_number && !guest.documentNumber.trim())) return "missing-details";
  if (rules.document_photo && !guest.imageDataUrl) return "missing-photo";
  if (rules.signature && !guest.signature) return "missing-signature";
  return "complete";
}

/** What the guest card still needs, in words, for the "need ..." summary. */
const needsText = (rules: CheckinRules): string =>
  ["name", rules.document_number ? "ID number" : "", rules.document_photo ? "ID photo" : "", rules.signature ? "signature" : ""].filter(Boolean).join(", ");

/** Short reasons the check-in cannot be marked complete yet; empty when ready. */
export function completionIssues(guests: AdminGuest[], booked: number, roomCount: number, contact: { phone: boolean; email: boolean } = { phone: true, email: true }, rules: CheckinRules = DEFAULT_CHECKIN_RULES): string[] {
  const issues: string[] = [];
  if (guests.length < 1) issues.push("Add at least one guest");
  const incomplete = guests.filter((guest) => !isGuestComplete(guest, rules)).length;
  if (incomplete > 0) issues.push(`${incomplete} guest${incomplete === 1 ? "" : "s"} need ${needsText(rules)}`);
  if (rules.room && roomCount === 0) issues.push("Assign at least one room");
  if (rules.contact_phone && !contact.phone) issues.push("Add a phone number");
  if (rules.contact_email && !contact.email) issues.push("Add an email address");
  if (rules.contact_either && !contact.phone && !contact.email) issues.push("Add a phone number or an email address");
  return issues;
}

/** Unchanged images and signatures are omitted; the server reuses them by saved index. */
export function buildGuestPayload(guests: AdminGuest[]): GuestPayload[] {
  return guests.map((guest, index) => {
    const moved = guest.savedIndex !== index;
    const item: GuestPayload = {
      fullName: guest.fullName.trim(),
      phone: guest.phone.trim(),
      documentType: guest.documentType,
      documentNumber: guest.documentNumber.trim(),
    };
    if (guest.imageDataUrl && (moved || guest.imageDataUrl !== guest.savedImage)) {
      item.documentImageDataUrl = guest.imageDataUrl;
      item.documentImageName = guest.imageName || `guest-${index + 1}-id.jpg`;
      item.documentImageType = guest.imageType || "image/jpeg";
    }
    if (guest.signature && (moved || guest.signature !== guest.savedSignature)) {
      item.signatureDataUrl = guest.signature;
    }
    return item;
  });
}

export const payloadSize = (items: GuestPayload[]): number =>
  items.reduce((sum, item) => sum + (item.documentImageDataUrl?.length ?? 0) + (item.signatureDataUrl?.length ?? 0), 0);
