import { ObjectId } from "mongodb";
import { parseImageDataUrl, r2 } from "./r2";

/**
 * Bucket layout for check-in files:
 *   Bookings/<YYYY-MM-DD the booking was created>/<booking id>/<file>
 * Mongo keeps only the reference ({ key, file_name, mime_type, uploaded_at }), never the image.
 */
export type StoredFile = {
  key?: string;
  data_url?: string;
  file_name?: string;
  mime_type?: string;
  uploaded_at?: string;
};

type BookingLike = { _id: unknown; created_at?: unknown };

/** Calendar day in India, where the property is, so a late-night booking lands in the right folder. */
const dayFolder = (booking: BookingLike): string => {
  const raw = booking.created_at;
  let created = raw instanceof Date || typeof raw === "string" || typeof raw === "number" ? new Date(raw) : null;
  if (!created || Number.isNaN(created.getTime())) {
    created = booking._id instanceof ObjectId ? booking._id.getTimestamp() : new Date();
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(created);
};

export const bookingFolder = (booking: BookingLike) => `Bookings/${dayFolder(booking)}/${String(booking._id)}`;

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "id";

/** "aadhar-guest-1", "passport-guest-2": named for what was uploaded. */
export const documentFileStem = (documentType: unknown, guestIndex: number) =>
  `${documentType === "Aadhar Card" ? "aadhar" : slug(String(documentType ?? ""))}-guest-${guestIndex + 1}`;

export const signatureFileStem = (guestIndex: number | "booking") =>
  guestIndex === "booking" ? "signature-booking" : `signature-guest-${guestIndex + 1}`;

/**
 * Returns the reference to keep in Mongo. An inline data URL (new upload, or a record saved before
 * R2) is uploaded first; an existing reference is passed through untouched.
 */
export const persistBookingFile = async (
  booking: BookingLike,
  stem: string,
  file: StoredFile | null | undefined,
): Promise<StoredFile | null> => {
  if (!file) return null;
  const { data_url, ...ref } = file;
  if (!data_url) return file.key ? ref : null;

  const { mimeType, extension, bytes } = parseImageDataUrl(data_url);
  const key = `${bookingFolder(booking)}/${stem}.${extension}`;
  await r2.put(key, bytes, mimeType);
  // A different format or document type changes the key; drop the file it replaces.
  if (ref.key && ref.key !== key) await r2.remove(ref.key);
  return { ...ref, key, mime_type: ref.mime_type || mimeType, uploaded_at: ref.uploaded_at ?? new Date().toISOString() };
};

const hydrateFile = async (file: StoredFile | null | undefined) => {
  if (!file?.key || file.data_url) return file;
  const data_url = await r2.getDataUrl(file.key);
  return data_url ? { ...file, data_url } : file;
};

/** Puts the images back inline (read from R2) so screens and invoices keep working unchanged. */
export const hydrateCheckinDetails = async <T>(details: T): Promise<T> => {
  if (!details || typeof details !== "object") return details;
  const source = details as Record<string, any>;
  const guests = Array.isArray(source.guests)
    ? await Promise.all(
        source.guests.map(async (guest: any) => ({
          ...guest,
          document_image: await hydrateFile(guest?.document_image),
          signature_image: await hydrateFile(guest?.signature_image),
        })),
      )
    : source.guests;
  return { ...source, guests, signature: await hydrateFile(source.signature) } as T;
};

export const hasStoredFile = (file: StoredFile | null | undefined) => Boolean(file?.key || file?.data_url);
