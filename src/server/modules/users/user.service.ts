import { ObjectId } from "mongodb";
import { seal, unseal } from "../../crypto";
import { env } from "../../env";
import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import { signSession, type AuthenticatedUser } from "../../session";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { currentRoomIds, isCheckinLocked } from "../../utils/roomAssignments";
import { parseImageDataUrl, r2 } from "../../storage/r2";

/**
 * Dedicated collection. A plain `users` collection can already exist in a shared database with
 * its own unique indexes (for example on `phone`), which rejects every account created without one.
 */
export const USERS_COLLECTION = "portal_users";

export const STAFF_ROLES = ["admin", "kitchen", "rooms"] as const;

type UserDocument = {
  _id: ObjectId;
  email: string;
  name?: string;
  picture?: string;
  phone?: string;
  roles?: string[];
  outlets?: unknown;
  isActive?: boolean;
  /** Identity details the user chose to save for autofill. Sensitive values are sealed (AES-GCM). */
  saved_id?: {
    document_type?: string;
    document_number?: string;
    /** Sealed values written before R2; new saves keep the image in the bucket and only its key here. */
    document_image?: string;
    signature?: string;
    document_image_key?: string;
    signature_key?: string;
    updated_at?: Date;
  };
};

export type SavedDetails = {
  documentType: string;
  documentNumber: string;
  documentImageDataUrl: string;
  signatureDataUrl: string;
  updatedAt: string | null;
};

export type UserProfile = {
  id: string;
  email: string | null;
  name: string;
  phone: string | null;
  picture: string | null;
  roles: string[];
  outlets: string[];
  /** What is saved, without the values themselves. The full details have their own endpoint. */
  saved: { documentType: string | null; documentLast4: string | null; hasDocumentImage: boolean; hasSignature: boolean };
};


const DOCUMENT_TYPES = ["Aadhar Card", "Driver's Licence", "Passport", "Voter ID", "Other"];
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_DOCUMENT_IMAGE_CHARS = 1_600_000;
const MAX_SIGNATURE_CHARS = 700_000;

const dataUrl = (value: unknown, label: string, max: number): string => {
  if (typeof value !== "string" || !IMAGE_DATA_URL.test(value)) {
    throw new HttpError(400, `${label} must be a JPG, PNG or WebP image`);
  }
  if (value.length > max) throw new HttpError(400, `${label} is too large. Use a smaller image`);
  return value;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const startOfTodayUtc = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const FINISHED_STATUSES = new Set(["CHECKED_OUT", "CANCELLED", "REJECTED", "NO_SHOW"]);

export type StayRoom = {
  id: string;
  code: string;
  outletId: string;
  outletName: string;
  bookingId: string;
  bookingCode: string;
  checkOutDate: string | null;
};

export type MyBooking = {
  id: string;
  bookingCode: string;
  status: string;
  outlet: string;
  checkInDate: string | null;
  checkOutDate: string | null;
  nights: number;
  guests: number;
  rooms: number;
  totalAmount: number;
  /** Online check-in is open once the front desk has confirmed the booking. */
  canCheckin: boolean;
  checkinSubmitted: boolean;
  /** Checked in with a room assigned: the check-in record is now the front desk's to change. */
  checkinLocked: boolean;
  /** Codes of the rooms assigned at check-in. */
  roomCodes: string[];
};

const sanitiseRoles = (raw: unknown): string[] => {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const roles = values
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter((value): value is (typeof STAFF_ROLES)[number] => (STAFF_ROLES as readonly string[]).includes(value));
  return Array.from(new Set(roles));
};

const sanitiseOutlets = (raw: unknown): string[] => {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const outlets = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return outlets.length > 0 ? Array.from(new Set(outlets)) : ["all"];
};

const collection = async () => {
  const users = mongoConnection.getDb().collection<UserDocument>(USERS_COLLECTION);
  await ensureIndexes();
  return users;
};

let indexesReady: Promise<unknown> | null = null;
const ensureIndexes = () => {
  indexesReady ??= mongoConnection
    .getDb()
    .collection(USERS_COLLECTION)
    .createIndex({ email: 1 }, { unique: true })
    .catch((error) => {
      indexesReady = null;
      console.error("[users] could not create email index", error);
    });
  return indexesReady;
};

const savedFolder = (userId: ObjectId | string) => `Bookings/saved-profiles/${String(userId)}`;

/** Stored as a plain image so it opens in the bucket. Returns the new key and removes the file it replaces. */
const putSavedImage = async (userId: ObjectId, name: "document-image" | "signature", dataUrl: string, oldKey?: string) => {
  const { mimeType, extension, bytes } = parseImageDataUrl(dataUrl);
  const key = `${savedFolder(userId)}/${name}.${extension}`;
  await r2.put(key, bytes, mimeType);
  if (oldKey && oldKey !== key) await r2.remove(oldKey);
  return key;
};

/** Image from R2, or the sealed copy in Mongo for details saved before R2. */
const readSavedImage = async (key: string | undefined, legacy: string | undefined): Promise<string> => {
  if (key) return (await r2.getDataUrl(key)) ?? "";
  return unseal(legacy) ?? "";
};

const summariseSaved = (doc: UserDocument): UserProfile["saved"] => {
  const saved = doc.saved_id;
  const number = unseal(saved?.document_number) ?? "";
  return {
    documentType: saved?.document_type ?? null,
    documentLast4: number ? number.replace(/\s/g, "").slice(-4) : null,
    hasDocumentImage: Boolean(saved?.document_image_key || unseal(saved?.document_image)),
    hasSignature: Boolean(saved?.signature_key || unseal(saved?.signature)),
  };
};

const toProfile = (doc: UserDocument): UserProfile => ({
  id: stringifyId(doc._id) ?? "",
  email: doc.email ?? null,
  name: doc.name?.trim() || doc.email?.split("@")[0] || "Guest",
  phone: doc.phone ?? null,
  picture: doc.picture ?? null,
  roles: sanitiseRoles(doc.roles),
  outlets: sanitiseOutlets(doc.outlets),
  saved: summariseSaved(doc),
});

const toSessionUser = (profile: UserProfile): AuthenticatedUser => ({
  id: profile.id,
  name: profile.name,
  email: profile.email ?? undefined,
  roles: profile.roles,
  outlets: profile.outlets,
  src: "user",
});

const bootstrapAdmins = () =>
  (env.ADMIN_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const userService = {
  /**
   * Called after Google has verified the address. Creates the account on first sign-in,
   * refreshes login metadata afterwards, and returns a session. Roles are never taken
   * from Google; they live on the user record and are edited in the database.
   */
  async signInWithGoogle(input: { email: string; name?: string; picture?: string }) {
    const email = input.email.trim().toLowerCase();
    const users = await collection();
    const now = new Date();

    const result = await users.findOneAndUpdate(
      { email },
      {
        $setOnInsert: {
          email,
          name: input.name?.trim() || email.split("@")[0],
          roles: [],
          outlets: ["all"],
          isActive: true,
          createdAt: now,
        },
        $set: { lastLoginAt: now, updatedAt: now, ...(input.picture ? { picture: input.picture } : {}) },
      },
      { upsert: true, returnDocument: "after" },
    );
    let doc = result as UserDocument | null;
    if (!doc) throw new HttpError(500, "Could not create account");
    if (doc.isActive === false) throw new HttpError(403, "This account has been deactivated");

    // First-admin bootstrap: addresses in ADMIN_GOOGLE_EMAILS always hold the admin role.
    if (bootstrapAdmins().includes(email) && !sanitiseRoles(doc.roles).includes("admin")) {
      const updated = await users.findOneAndUpdate(
        { _id: doc._id },
        { $addToSet: { roles: "admin" } },
        { returnDocument: "after" },
      );
      doc = (updated as UserDocument | null) ?? doc;
    }

    const profile = toProfile(doc);
    return { token: signSession(toSessionUser(profile)), user: toSessionUser(profile) };
  },

  /** Current roles/outlets straight from the database, so role changes apply immediately. */
  async getAccess(userId: string): Promise<{ roles: string[]; outlets: string[] } | null> {
    const id = toObjectId(userId);
    if (!id) return null;
    const doc = await (await collection()).findOne({ _id: id });
    if (!doc || doc.isActive === false) return null;
    return { roles: sanitiseRoles(doc.roles), outlets: sanitiseOutlets(doc.outlets) };
  },

  async getProfile(user: AuthenticatedUser): Promise<UserProfile> {
    const id = user.src === "user" ? toObjectId(user.id) : null;
    const doc = id ? await (await collection()).findOne({ _id: id }) : null;
    if (doc) return toProfile(doc);
    // Password-based staff sessions have no account record; echo what the token knows.
    return {
      id: user.id,
      email: user.email ?? null,
      name: user.name,
      phone: null,
      picture: null,
      roles: user.roles,
      outlets: user.outlets,
      saved: { documentType: null, documentLast4: null, hasDocumentImage: false, hasSignature: false },
    };
  },


  async getSavedDetails(user: AuthenticatedUser): Promise<SavedDetails> {
    const empty: SavedDetails = { documentType: "", documentNumber: "", documentImageDataUrl: "", signatureDataUrl: "", updatedAt: null };
    const id = user.src === "user" ? toObjectId(user.id) : null;
    const doc = id ? await (await collection()).findOne({ _id: id }) : null;
    const saved = doc?.saved_id;
    if (!saved) return empty;
    return {
      documentType: saved.document_type ?? "",
      documentNumber: unseal(saved.document_number) ?? "",
      documentImageDataUrl: await readSavedImage(saved.document_image_key, saved.document_image),
      signatureDataUrl: await readSavedImage(saved.signature_key, saved.signature),
      updatedAt: saved.updated_at ? new Date(saved.updated_at).toISOString() : null,
    };
  },

  /**
   * Saves identity details for autofill. Every field is optional so the profile page can update
   * the ID and the signature independently; `clear` removes them.
   */
  async saveDetails(
    user: AuthenticatedUser,
    input: {
      documentType?: unknown;
      documentNumber?: unknown;
      documentImageDataUrl?: unknown;
      signatureDataUrl?: unknown;
      clear?: unknown;
    },
  ) {
    const id = user.src === "user" ? toObjectId(user.id) : null;
    if (!id) throw new HttpError(400, "Saved details are only available for signed-in guest accounts");

    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    const clear = Array.isArray(input.clear) ? input.clear.map(String) : [];
    const current = ((await (await collection()).findOne({ _id: id }, { projection: { saved_id: 1 } })) as UserDocument | null)?.saved_id;

    if (clear.includes("document")) {
      unset["saved_id.document_type"] = "";
      unset["saved_id.document_number"] = "";
      unset["saved_id.document_image"] = "";
      unset["saved_id.document_image_key"] = "";
      if (current?.document_image_key) await r2.remove(current.document_image_key);
    }
    if (clear.includes("signature")) {
      unset["saved_id.signature"] = "";
      unset["saved_id.signature_key"] = "";
      if (current?.signature_key) await r2.remove(current.signature_key);
    }

    if (input.documentType !== undefined || input.documentNumber !== undefined) {
      const type = String(input.documentType ?? "");
      if (!DOCUMENT_TYPES.includes(type)) throw new HttpError(400, "Choose a valid document type");
      const number = String(input.documentNumber ?? "").trim();
      const compact = number.replace(/[\s-]/g, "");
      if (type === "Aadhar Card" ? !/^\d{12}$/.test(compact) : !/^[A-Za-z0-9/-]{4,30}$/.test(compact)) {
        throw new HttpError(400, type === "Aadhar Card" ? "Aadhaar number must be 12 digits" : "Enter a valid document number");
      }
      set["saved_id.document_type"] = type;
      set["saved_id.document_number"] = seal(compact);
    }
    if (input.documentImageDataUrl !== undefined) {
      set["saved_id.document_image_key"] = await putSavedImage(
        id,
        "document-image",
        dataUrl(input.documentImageDataUrl, "ID photo", MAX_DOCUMENT_IMAGE_CHARS),
        current?.document_image_key,
      );
      unset["saved_id.document_image"] = "";
    }
    if (input.signatureDataUrl !== undefined) {
      set["saved_id.signature_key"] = await putSavedImage(
        id,
        "signature",
        dataUrl(input.signatureDataUrl, "Signature", MAX_SIGNATURE_CHARS),
        current?.signature_key,
      );
      unset["saved_id.signature"] = "";
    }
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
      throw new HttpError(400, "Nothing to save");
    }

    for (const path of Object.keys(set)) delete unset[path]; // Mongo rejects one path in both operators
    set["saved_id.updated_at"] = new Date();
    set.updatedAt = new Date();
    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;

    const updated = await (await collection()).findOneAndUpdate({ _id: id }, update, { returnDocument: "after" });
    if (!updated) throw new HttpError(404, "Account not found");
    return summariseSaved(updated as UserDocument);
  },

  /**
   * Bookings made while signed in (user_id) plus any whose email is this account's verified
   * Google address. Phone numbers are never used for matching: they are unverified.
   */
  async listBookings(user: AuthenticatedUser): Promise<{ upcoming: MyBooking[]; past: MyBooking[] }> {
    const db = mongoConnection.getDb();
    const matches: Record<string, unknown>[] = [];
    if (user.src === "user") matches.push({ user_id: user.id });
    if (user.email) matches.push({ guest_email: { $regex: `^${escapeRegex(user.email)}$`, $options: "i" } });
    if (matches.length === 0) return { upcoming: [], past: [] };

    const docs = await db
      .collection("bookings")
      .find({ $or: matches })
      .project({
        booking_code: 1, status: 1, outlet_id: 1, check_in_date: 1, check_out_date: 1, nights: 1,
        number_of_guests: 1, rooms_requested: 1, total_amount: 1,
        room_id: 1, room_ids: 1, "rooms_allocated.room_id": 1,
        "checkin_details.status": 1, "checkin_details.guests.full_name": 1, "checkin_details.assigned_rooms": 1,
      })
      .sort({ check_in_date: -1 })
      .limit(200)
      .toArray();

    const outletNames = new Map<string, string>();
    for (const outlet of await db.collection("outlets").find({}).project({ location_key: 1, name: 1 }).toArray()) {
      if (outlet.location_key) outletNames.set(String(outlet.location_key), String(outlet.name ?? outlet.location_key));
    }

    const today = startOfTodayUtc().getTime();
    const upcoming: MyBooking[] = [];
    const past: MyBooking[] = [];
    for (const doc of docs) {
      const status = String(doc.status ?? "PENDING").toUpperCase();
      const checkIn = doc.check_in_date ? new Date(doc.check_in_date) : null;
      const checkOut = doc.check_out_date ? new Date(doc.check_out_date) : null;
      const locked = isCheckinLocked(doc);
      const isUpcoming = !FINISHED_STATUSES.has(status) && (checkOut ? checkOut.getTime() >= today : true);
      const entry: MyBooking = {
        id: stringifyId(doc._id) ?? "",
        bookingCode: String(doc.booking_code ?? ""),
        status,
        outlet: outletNames.get(String(doc.outlet_id)) ?? String(doc.outlet_id ?? ""),
        checkInDate: checkIn && !Number.isNaN(checkIn.getTime()) ? checkIn.toISOString() : null,
        checkOutDate: checkOut && !Number.isNaN(checkOut.getTime()) ? checkOut.toISOString() : null,
        nights: Number(doc.nights ?? 0),
        guests: Number(doc.number_of_guests ?? 0),
        rooms: Number(doc.rooms_requested ?? 0),
        totalAmount: Number(doc.total_amount ?? 0),
        canCheckin: isUpcoming && !locked && (status === "CONFIRMED" || status === "CHECKED_IN"),
        checkinSubmitted: Array.isArray(doc.checkin_details?.guests) && doc.checkin_details.guests.length > 0,
        checkinLocked: locked,
        roomCodes: ((doc.checkin_details?.assigned_rooms ?? []) as Array<{ code?: string }>)
          .map((room) => String(room?.code ?? "").trim())
          .filter(Boolean),
      };
      (isUpcoming ? upcoming : past).push(entry);
    }
    upcoming.sort((a, b) => String(a.checkInDate).localeCompare(String(b.checkInDate)));
    return { upcoming, past };
  },


  /**
   * The rooms this account can order to right now: rooms assigned on bookings that are checked in and
   * belong to the account (account link or verified email). Nothing is returned before check-in.
   */
  async getActiveStay(user: AuthenticatedUser): Promise<{ rooms: StayRoom[] } | null> {
    const db = mongoConnection.getDb();
    const matches: Record<string, unknown>[] = [];
    if (user.src === "user") matches.push({ user_id: user.id });
    if (user.email) matches.push({ guest_email: { $regex: `^${escapeRegex(user.email)}$`, $options: "i" } });
    if (matches.length === 0) return null;

    const bookings = await db
      .collection("bookings")
      .find({ status: "CHECKED_IN", $or: matches })
      .project({
        booking_code: 1, outlet_id: 1, check_out_date: 1, room_id: 1, room_ids: 1,
        "rooms_allocated.room_id": 1, "checkin_details.assigned_rooms": 1,
      })
      .sort({ checked_in_at: -1 })
      .limit(5)
      .toArray();

    const outletNames = new Map<string, string>();
    for (const outlet of await db.collection("outlets").find({}).project({ location_key: 1, name: 1 }).toArray()) {
      if (outlet.location_key) outletNames.set(String(outlet.location_key), String(outlet.name ?? outlet.location_key));
    }

    const rooms: StayRoom[] = [];
    const seen = new Set<string>();
    for (const booking of bookings) {
      const ids = new Set<string>(currentRoomIds(booking));

      const objectIds = Array.from(ids).map((id) => toObjectId(id)).filter((id): id is ObjectId => Boolean(id));
      if (objectIds.length === 0) continue;
      const docs = await db
        .collection("rooms_tables")
        .find({ _id: { $in: objectIds }, is_active: { $ne: false } })
        .toArray();
      for (const room of docs) {
        const id = stringifyId(room._id) ?? "";
        const type = String(room.type ?? "").toUpperCase();
        if (!id || seen.has(id) || (type !== "ROOM" && type !== "HOTEL_ROOM")) continue;
        seen.add(id);
        const outletId = String(room.outlet_id ?? booking.outlet_id ?? "");
        rooms.push({
          id,
          code: String(room.code ?? ""),
          outletId,
          outletName: outletNames.get(outletId) ?? outletId,
          bookingId: stringifyId(booking._id) ?? "",
          bookingCode: String(booking.booking_code ?? ""),
          checkOutDate: booking.check_out_date ? new Date(booking.check_out_date).toISOString() : null,
        });
      }
    }
    rooms.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return rooms.length > 0 ? { rooms } : null;
  },

  async updateProfile(user: AuthenticatedUser, input: { name?: unknown; phone?: unknown }) {
    const id = user.src === "user" ? toObjectId(user.id) : null;
    if (!id) throw new HttpError(400, "Profile is only available for signed-in guest accounts");

    const changes: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim().replace(/\s+/g, " ");
      if (!name || name.length > 100) throw new HttpError(400, "Enter a name up to 100 characters");
      changes.name = name;
    }
    if (input.phone !== undefined) {
      const phone = String(input.phone).replace(/[\s()-]/g, "");
      if (phone && !/^\+?[0-9]{7,15}$/.test(phone)) throw new HttpError(400, "Enter a valid phone number");
      changes.phone = phone;
    }
    if (Object.keys(changes).length === 0) throw new HttpError(400, "Nothing to update");

    const updated = await (await collection()).findOneAndUpdate(
      { _id: id },
      { $set: { ...changes, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) throw new HttpError(404, "Account not found");
    return toProfile(updated as UserDocument);
  },
};
