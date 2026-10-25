import { DOCUMENT_TYPES } from "@/components/stay/checkin/types";
import { optionalPhoneError, tenDigitPhone } from "@/lib/phone";
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
  while (guests.length < bookedGuestCount(context)) {
    guests.push(guests.length === 0 ? { ...blankGuest(), phone: tenDigitPhone(context.booking?.guest_phone) ?? "" } : blankGuest());
  }
  return guests;
}

export const hasDetails = (guest: AdminGuest): boolean =>
  !optionalPhoneError(guest.phone) && Boolean(guest.fullName.trim() && guest.documentType && guest.documentNumber.trim() && guest.imageDataUrl);

export const isGuestComplete = (guest: AdminGuest): boolean => hasDetails(guest) && Boolean(guest.signature);

export type Completeness = "complete" | "missing-details" | "missing-photo" | "missing-signature";

export function guestStatus(guest: AdminGuest): Completeness {
  if (!guest.fullName.trim() || !guest.documentNumber.trim()) return "missing-details";
  if (!guest.imageDataUrl) return "missing-photo";
  if (!guest.signature) return "missing-signature";
  return "complete";
}

/** Short reasons the check-in cannot be marked complete yet; empty when ready. */
export function completionIssues(guests: AdminGuest[], booked: number, roomCount: number): string[] {
  const issues: string[] = [];
  if (guests.length < booked) issues.push(`Add ${booked - guests.length} more guest${booked - guests.length === 1 ? "" : "s"}`);
  const incomplete = guests.filter((guest) => !isGuestComplete(guest)).length;
  if (incomplete > 0) issues.push(`${incomplete} guest${incomplete === 1 ? "" : "s"} need name, ID number, photo and signature`);
  if (roomCount === 0) issues.push("Assign at least one room");
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
