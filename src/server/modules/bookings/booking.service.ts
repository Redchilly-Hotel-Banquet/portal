import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { AuthenticatedUser } from "../../session";
import { matchesLastName } from "../../utils/dates";
import { normalizeDocument } from "../../utils/normalizers";
import { stringifyId, toObjectId } from "../../utils/objectId";
import { assignedRoomIds, isCheckinLocked } from "../../utils/roomAssignments";
import { ensureUniqueCheckinId } from "../../utils/checkinId";
import { computeGst, type GstSummary } from "../../utils/gst";
import { PAYMENT_MODE_VALUES, type PaymentLine } from "../../../lib/payment-modes";
import {
  documentFileStem,
  hasStoredFile,
  hydrateCheckinDetails,
  persistBookingFile,
  signatureFileStem,
} from "../../storage/booking-media";

type FlexibleId = string | import("mongodb").ObjectId;

type BookingRecord = Record<string, unknown> & {
  _id: FlexibleId;
  room_id?: FlexibleId;
  room_ids?: FlexibleId[];
  rooms_allocated?: Array<Record<string, unknown>>;
  outlet_id?: FlexibleId;
  checkin_details?: Record<string, unknown>;
  booking_code?: string;
  user_id?: string;
  guest_email?: unknown;
};

type RoomRecord = Record<string, unknown> & {
  _id: FlexibleId;
};

type OutletRecord = Record<string, unknown> & {
  _id: FlexibleId;
};

type ManageBookingsRequest = {
  action: "list" | "update_status" | "update_amount";
  id?: string;
  status?: string;
  totalAmount?: number;
};

type CheckinRequest = {
  action: "admin-fetch" | "submit" | "lookup";
  bookingId?: string;
  bookingCode?: string;
  checkinData?: Record<string, unknown>;
  markAsCheckedIn?: boolean;
  lastName?: string;
};

type BillingRequest = {
  bookingId?: string;
  action?: "checkout";
  /** How the guest paid, required to check out. The amounts must add up to the total payable. */
  payments?: Array<{ mode?: string; amount?: number | string; reference?: string }>;
};

type CreatePublicBookingRequest = {
  outlet_id?: string;
  outletId?: string;
  rooms_requested?: number;
  roomsRequested?: number;
  preferred_room_type?: string;
  preferredRoomType?: string;
  preferred_categories?: Record<string, unknown>;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  check_in_date?: string;
  check_out_date?: string;
  number_of_guests?: number;
  total_amount?: number;
  totalAmount?: number;
  room_total?: number;
  roomTotal?: number;
  guests_count?: number;
  guestsCount?: number;
  special_requests?: string;
  specialRequests?: string;
};

type OrderDocument = {
  _id: string | import("mongodb").ObjectId;
  total?: number;
  subtotal?: number;
  status?: string;
  created_at?: string | Date;
  booking_id?: string | import("mongodb").ObjectId;
};

const ORDER_STATUSES_TO_INCLUDE = new Set([
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "DELIVERED",
  "ORDER_FINISHED",
]);

const ACTIVE_BOOKING_STATUSES = new Set(["PENDING", "CONFIRMED", "CHECKED_IN"]);
const MAX_DATA_URL_LENGTH = 10_000_000;
const DAY_IN_MS = 86_400_000;

const toNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const normaliseString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const toPositiveInt = (value: unknown, fallback = 0): number => {
  const numeric = Math.floor(toNumber(value, fallback));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const normaliseId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object" && value) {
    const maybe = (value as { toString?: () => string }).toString?.();
    if (maybe && maybe !== "[object Object]") {
      return maybe;
    }
    const oid = (value as { $oid?: string }).$oid;
    if (typeof oid === "string") return oid;
  }
  return undefined;
};

/** Optional 10-digit Indian mobile number (a leading +91, 91 or 0 is dropped). Null when blank. */
const normaliseGuestPhone = (value: unknown, label: string): string | null => {
  const raw = normaliseString(value);
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new HttpError(400, `${label}: enter a valid 10-digit mobile number, or leave it blank.`);
  }
  return digits;
};

/** Validates how the guest paid. Amounts are checked against the total once the bill is known. */
const parsePayments = (raw: BillingRequest["payments"]): PaymentLine[] => {
  const entries = Array.isArray(raw) ? raw.slice(0, 10) : [];
  if (entries.length === 0) throw new HttpError(400, "Choose how the guest paid before checking out.");
  return entries.map((entry) => {
    const mode = String(entry?.mode ?? "");
    if (!PAYMENT_MODE_VALUES.includes(mode)) throw new HttpError(400, "Choose a payment source for every payment.");
    const amount = Math.round(Number(entry?.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Every payment needs an amount above zero.");
    const reference = typeof entry?.reference === "string" ? entry.reference.trim().slice(0, 80) : "";
    return { mode, amount, reference: reference || null };
  });
};

const sanitiseDataUrl = (value: unknown) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !trimmed.startsWith("data:")) return null;
  if (trimmed.length > MAX_DATA_URL_LENGTH) {
    throw new HttpError(
      400,
      "Uploaded file is too large. Please keep uploads under 7MB.",
    );
  }
  return trimmed;
};

const sanitisePreferredCategories = (
  raw: unknown,
  fallbackCategory: string | null,
  fallbackCount: number,
): Record<string, number> | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (fallbackCategory && fallbackCount > 0) {
      return { [fallbackCategory]: fallbackCount };
    }
    return null;
  }

  const entries = Object.entries(raw as Record<string, unknown>).reduce<
    Record<string, number>
  >((acc, [key, value]) => {
    const normalisedKey = normaliseString(key);
    if (!normalisedKey) return acc;
    const count = toPositiveInt(value, 0);
    if (count <= 0) return acc;
    acc[normalisedKey] = (acc[normalisedKey] ?? 0) + count;
    return acc;
  }, {});

  if (Object.keys(entries).length > 0) {
    return entries;
  }

  if (fallbackCategory && fallbackCount > 0) {
    return { [fallbackCategory]: fallbackCount };
  }

  return null;
};

const generateBookingCodeCandidate = () => {
  const timestampPart = Date.now().toString(36).toUpperCase().slice(-3);
  const randomPart = Math.random()
    .toString(36)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 3);
  const paddedRandom = randomPart.padEnd(3, "X");
  return `RC-${timestampPart}${paddedRandom}`;
};

const ensureUniqueBookingCode = async (
  collection: import("mongodb").Collection<BookingRecord>,
) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = generateBookingCodeCandidate();
    const existing = await collection.findOne(
      { booking_code: code } as import("mongodb").Filter<BookingRecord>,
      { projection: { _id: 1 } },
    );
    if (!existing) return code;
  }
  throw new HttpError(
    500,
    "Unable to generate booking code. Please try again.",
  );
};

const ensureObjectId = (value: unknown, message: string) => {
  const resolved = toObjectId(value);
  if (!resolved) {
    throw new HttpError(400, message);
  }
  return resolved;
};

const resolveDocumentId = (value: unknown, message: string): FlexibleId => {
  const objectId = toObjectId(value);
  if (objectId) return objectId;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  throw new HttpError(400, message);
};

const computeAvailableRooms = async (
  db: import("mongodb").Db,
  booking: BookingRecord,
) => {
  const roomsCollection = db.collection<RoomRecord>("rooms_tables");
  const bookingsCollection = db.collection<BookingRecord>("bookings");

  const outletId = booking?.outlet_id;
  const checkInDate = booking?.check_in_date
    ? new Date(booking.check_in_date as string)
    : null;
  const checkOutDate = booking?.check_out_date
    ? new Date(booking.check_out_date as string)
    : null;

  if (
    !outletId ||
    !checkInDate ||
    !checkOutDate ||
    Number.isNaN(checkInDate.getTime()) ||
    Number.isNaN(checkOutDate.getTime())
  ) {
    return [] as Array<{
      id: string;
      code: string;
      type?: string;
      room_type?: string;
      occupancy?: number;
      price_per_night?: number;
      level?: string;
      isAssignedToBooking: boolean;
      isOccupiedByAnother: boolean;
    }>;
  }

  const allRooms = await roomsCollection
    .find({
      outlet_id: outletId,
      is_active: { $ne: false },
      type: { $in: ["ROOM", "room", "HOTEL_ROOM", "hotel_room"] },
    })
    .toArray();

  const otherBookings = await bookingsCollection
    .find({
      outlet_id: outletId,
      status: { $in: Array.from(ACTIVE_BOOKING_STATUSES) },
      _id: { $ne: booking._id as any },
    })
    .toArray();

  const overlappingRoomIds = new Set<string>();
  otherBookings.forEach((candidate) => {
    const otherCheckIn = candidate?.check_in_date
      ? new Date(candidate.check_in_date as string | number | Date)
      : null;
    const otherCheckOut = candidate?.check_out_date
      ? new Date(candidate.check_out_date as string | number | Date)
      : null;
    if (
      !otherCheckIn ||
      !otherCheckOut ||
      Number.isNaN(otherCheckIn.getTime()) ||
      Number.isNaN(otherCheckOut.getTime())
    ) {
      return;
    }

    const overlaps =
      otherCheckIn <= checkOutDate && otherCheckOut >= checkInDate;
    if (!overlaps) return;

    assignedRoomIds(candidate).forEach((id) => overlappingRoomIds.add(id));
  });

  const bookingRoomIds = new Set<string>(assignedRoomIds(booking));

  const collator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
  });
  return allRooms
    .map((room: any) => {
      const id = normaliseId(room?._id);
      if (!id) return null;
      return {
        id,
        code: String(room.code ?? ""),
        type: room.type ? String(room.type) : undefined,
        room_type: room.room_type ? String(room.room_type) : undefined,
        occupancy: room.occupancy != null ? Number(room.occupancy) : undefined,
        price_per_night:
          room.price_per_night != null
            ? Number(room.price_per_night)
            : undefined,
        level: room.level ? String(room.level) : undefined,
        isAssignedToBooking: bookingRoomIds.has(id),
        isOccupiedByAnother:
          overlappingRoomIds.has(id) && !bookingRoomIds.has(id),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => collator.compare(a.code ?? "", b.code ?? ""));
};

const serialiseBookingDetailed = (doc: Record<string, unknown>, includeCheckinId = false) => {
  const clone = { ...doc } as Record<string, unknown>;
  if (!includeCheckinId) delete clone.checkin_id;
  const id = stringifyId(clone._id) ?? stringifyId(clone.id);
  if (id) {
    clone.id = id;
    clone._id = id;
  } else {
    delete clone._id;
  }

  if (clone.room_id) {
    const roomId = stringifyId(clone.room_id);
    clone.room_id = roomId ?? clone.room_id;
  }

  if (Array.isArray(clone.room_ids)) {
    clone.room_ids = clone.room_ids
      .map((value: unknown) => stringifyId(value) ?? normaliseId(value))
      .filter((value): value is string => Boolean(value));
  }

  if (Array.isArray(clone.rooms_allocated)) {
    clone.rooms_allocated = clone.rooms_allocated.map((entry: any) => {
      if (!entry) return entry;
      const { _id: entryId, room_id: entryRoomId, ...rest } = entry;
      const mapped: Record<string, unknown> = { ...rest };
      const resolvedId = stringifyId(entryId) ?? normaliseId(entryId);
      if (resolvedId) mapped.id = resolvedId;
      const resolvedRoomId =
        stringifyId(entryRoomId) ?? normaliseId(entryRoomId);
      if (resolvedRoomId) mapped.room_id = resolvedRoomId;
      return mapped;
    });
  }

  return clone;
};
const serialiseEmbedded = (doc: any) => {
  if (!doc) return null;
  const { wifi_name, wifi_password, wifi_floors, welcome_message, ...safe } = doc;
  const normalised = normalizeDocument(safe);
  if (!normalised) return null;
  return { ...normalised, id: normalised.id ?? stringifyId(doc?._id) ?? "" };
};


const last4 = (value: unknown): string | null => {
  const digits = String(value ?? "").replace(/\s|-/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits || null;
};

/**
 * What a check-in record looks like to someone who only proved they know the booking code and last
 * name: who is staying and what is on file, but never the ID photos, numbers or signatures.
 */
const summariseCheckin = (details: Record<string, any> | null | undefined) => {
  if (!details) return null;
  const { guests, signature, ...rest } = details;
  return {
    ...rest,
    guests: (Array.isArray(guests) ? guests : []).map((guest: any) => ({
      full_name: guest?.full_name ?? "",
      document_type: guest?.document_type ?? "",
      document_number_last4: last4(guest?.document_number),
      has_document_image: hasStoredFile(guest?.document_image),
      has_signature: hasStoredFile(guest?.signature_image),
    })),
    has_signature: hasStoredFile(signature),
  };
};

/** The check-in ID is a credential for ordering to the room, so only staff-facing responses carry it. */
const normaliseBooking = (doc: any, includeCheckinId = false) => {
  if (!doc) return null;
  const { guest_token, checkin_id, ...rest } = doc;
  if (includeCheckinId && checkin_id) rest.checkin_id = checkin_id;
  const normalised = normalizeDocument(rest);
  if (!normalised) return null;
  const primaryRoomId = stringifyId(rest.room_id);
  if (primaryRoomId) normalised.room_id = primaryRoomId;
  if (Array.isArray(normalised.room_ids)) {
    normalised.room_ids = normalised.room_ids.map(
      (rid: any) => stringifyId(rid) ?? String(rid ?? ""),
    );
  }
  return normalised;
};

export class BookingService {
  async createPublic(request: CreatePublicBookingRequest, userId?: string | null) {
    const outletIdRaw = normaliseString(
      request?.outlet_id ?? request?.outletId,
    );
    if (!outletIdRaw) {
      throw new HttpError(400, "outlet_id is required");
    }

    const checkInRaw = request?.check_in_date;
    const checkOutRaw = request?.check_out_date;
    if (!checkInRaw || !checkOutRaw) {
      throw new HttpError(400, "check_in_date and check_out_date are required");
    }

    const checkIn = new Date(checkInRaw);
    const checkOut = new Date(checkOutRaw);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new HttpError(400, "Invalid check-in or check-out date");
    }
    if (checkOut <= checkIn) {
      throw new HttpError(400, "check_out_date must be after check_in_date");
    }

    const roomsRequested =
      toPositiveInt(request?.rooms_requested, 0) ||
      toPositiveInt(request?.roomsRequested, 0);
    if (roomsRequested <= 0) {
      throw new HttpError(400, "rooms_requested must be a positive number");
    }

    const guestsCount =
      toPositiveInt(request?.number_of_guests, 0) ||
      toPositiveInt(request?.guests_count, 0) ||
      toPositiveInt(request?.guestsCount, 0);
    if (guestsCount <= 0) {
      throw new HttpError(400, "number_of_guests must be a positive number");
    }

    const totalAmountRaw =
      request?.total_amount ??
      request?.totalAmount ??
      request?.room_total ??
      request?.roomTotal;
    const totalAmount = Number(totalAmountRaw ?? 0);
    if (totalAmount < 0 || Number.isNaN(totalAmount)) {
      throw new HttpError(
        400,
        "total_amount must be zero or a positive number",
      );
    }

    const preferredRoomType = normaliseString(
      request?.preferred_room_type ?? request?.preferredRoomType,
    );

    if (!preferredRoomType) {
      throw new HttpError(400, "preferred_room_type is required");
    }
    const guestName = normaliseString(request?.guest_name);
    if (!guestName) {
      throw new HttpError(400, "guest_name is required");
    }

    const guestEmailRaw = normaliseString(request?.guest_email);
    const guestEmail = guestEmailRaw ? guestEmailRaw.toLowerCase() : null;
    const guestPhone = normaliseString(request?.guest_phone) || null;

    const specialRequests =
      normaliseString(request?.special_requests ?? request?.specialRequests) ||
      null;

    const nights = Math.max(
      Math.ceil((checkOut.getTime() - checkIn.getTime()) / DAY_IN_MS),
      1,
    );

    const preferredCategories = sanitisePreferredCategories(
      request?.preferred_categories,
      preferredRoomType || null,
      roomsRequested,
    );

    const now = new Date();
    const db = mongoConnection.getDb();
    const bookingsCollection = db.collection<BookingRecord>("bookings");

    const bookingCode = await ensureUniqueBookingCode(bookingsCollection);
    const checkinId = await ensureUniqueCheckinId(bookingsCollection);

    const bookingDoc: Omit<BookingRecord, "_id"> & { roomsRequested: number } =
      {
        outlet_id: outletIdRaw,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
        check_in_date: checkIn,
        check_out_date: checkOut,
        number_of_guests: guestsCount,
        rooms_requested: roomsRequested,
        roomsRequested,
        preferred_room_type: preferredRoomType || null,
        preferred_categories: preferredCategories,
        total_amount: Number(totalAmount.toFixed(2)),
        special_requests: specialRequests,
        booking_code: bookingCode,
        checkin_id: checkinId,
        // Set from the verified session, never from the request body.
        ...(userId ? { user_id: userId } : {}),
        status: "PENDING",
        nights,
        rooms_allocated: [],
        checkin_details: null,
        created_at: now,
        updated_at: now,
      };

    const insertResult = await bookingsCollection.insertOne(bookingDoc as any);
    const createdBooking = {
      ...bookingDoc,
      _id: insertResult.insertedId,
    };
    const response = normaliseBooking(createdBooking);

    return {
      booking: response,
    };
  }

  async manage(request: ManageBookingsRequest, user: AuthenticatedUser) {
    if (!user.roles.includes("admin") && !user.roles.includes("rooms")) {
      throw new HttpError(403, "Insufficient permissions to manage bookings");
    }

    const db = mongoConnection.getDb();
    const bookingsCollection = db.collection<BookingRecord>("bookings");
    const roomsCollection = db.collection<RoomRecord>("rooms_tables");
    const outletsCollection = db.collection<OutletRecord>("outlets");

    switch (request.action) {
      case "list": {
        const filter: Record<string, unknown> = {};
        if (!user.outlets.includes("all")) {
          filter.outlet_id = { $in: user.outlets };
        }
        const bookings = await bookingsCollection
          .find(filter)
          .sort({ created_at: -1 })
          .toArray();

        // One query per collection instead of two per booking: this list is polled every 10 seconds.
        const lookup = async (collection: any, values: unknown[]) => {
          const ids = Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
          if (!ids.length) return new Map<string, any>();
          const docs = await collection
            .find({ _id: { $in: ids.flatMap((id) => [id, toObjectId(id)].filter(Boolean)) } })
            .toArray();
          return new Map<string, any>(docs.map((doc: any) => [String(doc._id), doc]));
        };
        const [roomsById, outletsById] = await Promise.all([
          lookup(roomsCollection, bookings.map((booking) => booking.room_id)),
          lookup(outletsCollection, bookings.map((booking) => booking.outlet_id)),
        ]);

        const enriched = bookings.map((booking) => ({
          ...normaliseBooking(booking, true),
          rooms_tables: serialiseEmbedded(roomsById.get(String(booking.room_id)) ?? null),
          outlets: serialiseEmbedded(outletsById.get(String(booking.outlet_id)) ?? null),
        }));

        // Wi-Fi and welcome text per branch, for the "send to guest" messages. Staff-only: never public.
        const welcome: Record<string, Record<string, unknown>> = {};
        for (const outlet of await outletsCollection.find({}).toArray()) {
          const key = normaliseString((outlet as any).location_key);
          if (!key) continue;
          welcome[key] = {
            name: normaliseString((outlet as any).name) || key,
            wifi_name: normaliseString((outlet as any).wifi_name),
            wifi_password: normaliseString((outlet as any).wifi_password),
            wifi_floors: Array.isArray((outlet as any).wifi_floors) ? (outlet as any).wifi_floors : [],
            welcome_message: normaliseString((outlet as any).welcome_message),
          };
        }

        // Floor of every room a booking holds, so the message can pick that floor's Wi-Fi.
        const heldRoomIds = Array.from(new Set(bookings.flatMap((booking) => assignedRoomIds(booking))));
        const levelDocs = heldRoomIds.length
          ? await roomsCollection
              .find({ _id: { $in: heldRoomIds.flatMap((id) => [id, toObjectId(id)].filter(Boolean)) } } as any, { projection: { level: 1 } })
              .toArray()
          : [];
        const room_levels: Record<string, string> = {};
        for (const doc of levelDocs) room_levels[String(doc._id)] = normaliseString((doc as any).level);

        return { bookings: enriched, welcome, room_levels };
      }

      case "update_status": {
        if (!request.id || !request.status) {
          throw new HttpError(400, "id and status are required");
        }

        const patch: Record<string, unknown> = {
          status: request.status,
          updated_at: new Date(),
        };
        if (request.status === "CHECKED_IN") patch.checked_in_at = new Date();
        if (request.status === "CHECKED_OUT") patch.checked_out_at = new Date();

        const filter = {
          _id: resolveDocumentId(request.id, "Invalid booking id"),
        };
        await bookingsCollection.updateOne(filter, { $set: patch });

        const updated = await bookingsCollection.findOne(filter);
        if (!updated) {
          throw new HttpError(404, "Booking not found");
        }

        const room = updated.room_id
          ? await roomsCollection.findOne({
              _id: resolveDocumentId(updated.room_id, "Invalid room id"),
            })
          : null;
        const outlet = updated.outlet_id
          ? await outletsCollection.findOne({
              _id: resolveDocumentId(updated.outlet_id, "Invalid outlet id"),
            })
          : null;

        const normalised = normaliseBooking(updated, true);

        return {
          booking: {
            ...normalised,
            rooms_tables: serialiseEmbedded(room),
            outlets: serialiseEmbedded(outlet),
          },
        };
      }

      case "update_amount": {
        if (!request.id) {
          throw new HttpError(400, "id is required");
        }

        const totalAmount = Number(request.totalAmount ?? NaN);
        if (!Number.isFinite(totalAmount) || totalAmount < 0) {
          throw new HttpError(400, "totalAmount must be a positive number");
        }

        const filter = {
          _id: resolveDocumentId(request.id, "Invalid booking id"),
        };
        const patch: Record<string, unknown> = {
          total_amount: Number(totalAmount.toFixed(2)),
          room_total: Number(totalAmount.toFixed(2)),
          updated_at: new Date(),
        };

        const result = await bookingsCollection.updateOne(filter, {
          $set: patch,
        });
        if (!result.matchedCount) {
          throw new HttpError(404, "Booking not found");
        }

        const updated = await bookingsCollection.findOne(filter);
        if (!updated) {
          throw new HttpError(404, "Booking not found");
        }

        const room = updated.room_id
          ? await roomsCollection.findOne({
              _id: resolveDocumentId(updated.room_id, "Invalid room id"),
            })
          : null;
        const outlet = updated.outlet_id
          ? await outletsCollection.findOne({
              _id: resolveDocumentId(updated.outlet_id, "Invalid outlet id"),
            })
          : null;

        const normalised = normaliseBooking(updated, true);

        return {
          booking: {
            ...normalised,
            rooms_tables: serialiseEmbedded(room),
            outlets: serialiseEmbedded(outlet),
          },
        };
      }

      default:
        throw new HttpError(400, "Invalid action");
    }
  }

  async checkin(
    request: CheckinRequest,
    user: AuthenticatedUser | null,
    /** Signed-in guest on the public route. Lets the booking's owner skip the last-name check. */
    account?: { id: string; email?: string } | null,
  ) {
    const roles = Array.isArray(user?.roles) ? (user?.roles as string[]) : [];
    const isPrivileged = roles.includes("admin") || roles.includes("rooms");
    const action = request?.action;

    if (!action) {
      throw new HttpError(400, "action is required");
    }

    if (!isPrivileged && action !== "lookup" && action !== "submit") {
      throw new HttpError(403, "Insufficient permissions to manage check-ins");
    }

    const db = mongoConnection.getDb();
    const bookingsCollection = db.collection<BookingRecord>("bookings");
    const roomsCollection = db.collection<RoomRecord>("rooms_tables");

    if (action === "admin-fetch") {
      const bookingId = request.bookingId;
      if (!bookingId) {
        throw new HttpError(400, "bookingId is required");
      }

      const bookingObjectId = ensureObjectId(bookingId, "Invalid booking id");

      const booking = await bookingsCollection.findOne({
        _id: bookingObjectId,
      });

      if (!booking) {
        throw new HttpError(404, "Booking not found");
      }

      const availableRooms = await computeAvailableRooms(db, booking);

      return {
        booking: serialiseBookingDetailed(booking, true),
        checkinDetails: await hydrateCheckinDetails(booking.checkin_details ?? null),
        availableRooms,
      };
    }

    if (action === "submit") {
      const bookingIdRaw = request.bookingId;
      const bookingCode = normaliseString(request.bookingCode).toUpperCase();
      const checkinData = (request.checkinData ?? {}) as Record<
        string,
        unknown
      >;
      const markAsCheckedIn = Boolean(request.markAsCheckedIn);

      if (!isPrivileged) {
        if (markAsCheckedIn) {
          throw new HttpError(
            403,
            "Guests cannot complete the check-in themselves.",
          );
        }
      }

      if (!bookingIdRaw || !bookingCode) {
        throw new HttpError(400, "bookingId and bookingCode are required");
      }

      const bookingObjectId = ensureObjectId(
        bookingIdRaw,
        "Invalid booking id",
      );

      const bookingFilter: import("mongodb").Filter<BookingRecord> = {
        _id: bookingObjectId,
        booking_code: bookingCode,
      };

      const booking = await bookingsCollection.findOne(bookingFilter);
      if (!booking) {
        throw new HttpError(
          404,
          "Unable to locate the booking. Please refresh and try again.",
        );
      }

      const bookingStatus = normaliseString(booking.status).toUpperCase();
      const isBookingReady =
        bookingStatus === "CONFIRMED" || bookingStatus === "CHECKED_IN";
      if (!isPrivileged && !isBookingReady) {
        throw new HttpError(
          409,
          "Booking not yet confirmed. Please reach out to the front desk for help.",
        );
      }

      if (!isPrivileged && isCheckinLocked(booking)) {
        throw new HttpError(
          403,
          "You are checked in and your room is assigned, so these details are locked. Please ask the front desk if anything needs to change.",
        );
      }

      const previousDetails = (booking.checkin_details ?? {}) as Record<
        string,
        any
      >;
      const previousGuests = Array.isArray(previousDetails.guests)
        ? previousDetails.guests
        : [];
      const incomingGuests = Array.isArray(checkinData.guests)
        ? checkinData.guests
        : [];

      if (!incomingGuests.length) {
        throw new HttpError(
          400,
          "At least one guest is required for check-in.",
        );
      }

      // Guests check in exactly the number they booked for. Reception may add more later.
      const requiredGuests = Math.max(Math.floor(Number(booking.number_of_guests)) || 0, 1);
      if (!isPrivileged && incomingGuests.length !== requiredGuests) {
        throw new HttpError(
          400,
          `This booking is for ${requiredGuests} guest${requiredGuests === 1 ? "" : "s"}. Please provide details for exactly ${requiredGuests}.`,
        );
      }

      const mappedGuests = incomingGuests.map(
        (guest: any, index: number) => {
          const existingGuest = previousGuests[index] ?? null;
          const fullName = normaliseString(guest?.fullName ?? guest?.name);
          const documentType = normaliseString(
            guest?.documentType ?? guest?.idType,
          );
          const documentNumber = normaliseString(
            guest?.documentNumber ?? guest?.idNumber,
          );

          if (!fullName) {
            throw new HttpError(400, `Guest ${index + 1}: name is required.`);
          }
          if (!documentType) {
            throw new HttpError(
              400,
              `Guest ${index + 1}: document type is required.`,
            );
          }
          if (!documentNumber) {
            throw new HttpError(
              400,
              `Guest ${index + 1}: document number is required.`,
            );
          }

          const incomingImage = sanitiseDataUrl(
            guest?.documentImageDataUrl ??
              guest?.documentImage ??
              guest?.document_image?.data_url,
          );

          const imagePayload = incomingImage
            ? {
                data_url: incomingImage,
                file_name: normaliseString(
                  guest?.documentImageName ?? guest?.document_image?.file_name,
                ),
                mime_type: normaliseString(
                  guest?.documentImageType ?? guest?.document_image?.mime_type,
                ),
                uploaded_at: new Date().toISOString(),
              }
            : (existingGuest?.document_image ?? null);

          if (!imagePayload) {
            throw new HttpError(
              400,
              `Guest ${index + 1}: identity document image is required.`,
            );
          }

          const incomingSignature = sanitiseDataUrl(
            guest?.signatureDataUrl ?? guest?.signature_image?.data_url,
          );
          const signaturePayload = incomingSignature
            ? {
                data_url: incomingSignature,
                file_name: normaliseString(
                  guest?.signatureFileName ?? guest?.signature_image?.file_name,
                ),
                mime_type: normaliseString(
                  guest?.signatureFileType ?? guest?.signature_image?.mime_type,
                ),
                uploaded_at: new Date().toISOString(),
              }
            : (existingGuest?.signature_image ?? null);

          if (!isPrivileged && !signaturePayload) {
            throw new HttpError(
              400,
              `Guest ${index + 1}: a signature is required.`,
            );
          }

          // Optional. Left out of the request means "keep what is saved"; an empty value clears it.
          const phone =
            guest && ("phone" in guest || "phoneNumber" in guest)
              ? normaliseGuestPhone(guest.phone ?? guest.phoneNumber, `Guest ${index + 1}`)
              : (existingGuest?.phone ?? null);

          return {
            full_name: fullName,
            phone,
            document_type: documentType,
            document_number: documentNumber,
            document_image: imagePayload,
            signature_image: signaturePayload,
          };
        },
      );

      // A guest re-submitting must not erase guests reception added beyond the booked count.
      const sanitisedGuests = isPrivileged
        ? mappedGuests
        : [...mappedGuests, ...previousGuests.slice(requiredGuests)];

      if (markAsCheckedIn) {
        if (sanitisedGuests.length < requiredGuests) {
          throw new HttpError(
            400,
            `${requiredGuests} guest${requiredGuests === 1 ? " was" : "s were"} booked. Add every guest before checking in.`,
          );
        }
        sanitisedGuests.forEach((guest, index) => {
          if (!guest.document_image) {
            throw new HttpError(400, `Guest ${index + 1}: attach an identity document before check-in.`);
          }
          if (!guest.signature_image) {
            throw new HttpError(400, `Guest ${index + 1}: a signature is required before check-in.`);
          }
        });
      }

      const expectedArrivalRaw = normaliseString(
        checkinData.expectedArrivalTime,
      );
      const needsAssistance = Boolean(checkinData.needsSpecialAssistance);
      const specialAssistance = needsAssistance
        ? normaliseString(checkinData.specialAssistanceDetails)
        : "";
      const otherRequests = normaliseString(checkinData.otherRequests);

      let assignedRooms: Array<{
        id: string;
        code?: string | null;
        type?: string | null;
        room_type?: string | null;
        assigned_at?: string | null;
      }> = [];

      const availabilitySnapshot = await computeAvailableRooms(db, booking);

      const assignedRoomIdsInput = Array.isArray(checkinData.assignedRoomIds)
        ? checkinData.assignedRoomIds
        : checkinData.assignedRoomId
          ? [checkinData.assignedRoomId]
          : null;

      const nowIso = new Date().toISOString();

      if (
        !isPrivileged &&
        assignedRoomIdsInput !== null &&
        assignedRoomIdsInput.length > 0
      ) {
        throw new HttpError(403, "Guests cannot assign rooms during check-in.");
      }

      if (assignedRoomIdsInput !== null) {
        const normalisedIds = assignedRoomIdsInput
          .map((value: unknown) => normaliseId(value))
          .filter((value): value is string => Boolean(value));

        assignedRooms = await Promise.all(
          normalisedIds.map(async (roomId) => {
            const snapshotRoom = availabilitySnapshot.find(
              (room) => room.id === roomId,
            );
            if (snapshotRoom) {
              if (
                snapshotRoom.isOccupiedByAnother &&
                !snapshotRoom.isAssignedToBooking
              ) {
                throw new HttpError(
                  400,
                  "One of the selected rooms is no longer available. Please refresh.",
                );
              }
              const snapshotType =
                snapshotRoom.room_type ?? snapshotRoom.type ?? null;
              return {
                id: roomId,
                code: snapshotRoom.code ?? null,
                type: snapshotType,
                room_type: snapshotType,
                assigned_at: nowIso,
              };
            }

            const raw = await roomsCollection.findOne({
              _id: ensureObjectId(roomId, "Invalid room id"),
            });
            if (!raw) {
              throw new HttpError(
                400,
                "Selected room could not be found. Please refresh the page.",
              );
            }
            const fallbackType =
              normaliseString(raw.room_type ?? raw.type) || null;
            return {
              id: roomId,
              code: normaliseString(raw.code) || null,
              type: fallbackType,
              room_type: fallbackType,
              assigned_at: nowIso,
            };
          }),
        );
      } else {
        const previousAssigned = Array.isArray(previousDetails.assigned_rooms)
          ? previousDetails.assigned_rooms
          : [];
        assignedRooms = previousAssigned
          .map((room: any) => ({
            id: normaliseId(room?.id ?? room?.room_id) ?? "",
            code: room?.code ?? null,
            type: room?.type ?? room?.room_type ?? null,
            room_type: room?.room_type ?? room?.type ?? null,
            assigned_at: room?.assigned_at ?? null,
          }))
          .filter((room) => room.id);
      }

      if (markAsCheckedIn && assignedRooms.length === 0) {
        throw new HttpError(
          400,
          "Assign at least one room before marking the booking as checked in.",
        );
      }

      // Images go to R2 (Bookings/<day>/<booking id>/); Mongo keeps only their keys.
      const storedGuests = await Promise.all(
        sanitisedGuests.map(async (guest: any, index: number) => ({
          ...guest,
          document_image: await persistBookingFile(
            booking,
            documentFileStem(guest.document_type, index),
            guest.document_image,
          ),
          signature_image: await persistBookingFile(booking, signatureFileStem(index), guest.signature_image),
        })),
      );

      const signatureRaw = sanitiseDataUrl(
        checkinData.digitalSignature ?? checkinData.signatureDataUrl,
      );
      const signaturePayload = await persistBookingFile(
        booking,
        signatureFileStem("booking"),
        signatureRaw
          ? {
              data_url: signatureRaw,
              file_name: normaliseString(checkinData.digitalSignatureName),
              mime_type: normaliseString(checkinData.digitalSignatureType),
              uploaded_at: nowIso,
            }
          : ((previousDetails.signature as Record<string, any>) ?? null),
      );
      // Older screens read one booking-level signature; keep it in step with the first guest's.
      const primarySignature = storedGuests[0]?.signature_image ?? signaturePayload;

      const previousStatus =
        typeof previousDetails.status === "string"
          ? previousDetails.status
          : null;
      const derivedStatus = markAsCheckedIn
        ? "COMPLETED"
        : previousStatus && previousStatus.length > 0
          ? previousStatus
          : "IN_PROGRESS";

      const nextCheckinDetails: Record<string, unknown> = {
        status: derivedStatus,
        submitted_at: previousDetails.submitted_at ?? nowIso,
        last_updated_at: nowIso,
        expected_arrival_time: expectedArrivalRaw || null,
        needs_special_assistance: needsAssistance,
        special_assistance_details: needsAssistance
          ? specialAssistance || null
          : null,
        other_requests: otherRequests || null,
        guests: storedGuests,
        signature: primarySignature,
      };

      if (assignedRooms.length > 0) {
        nextCheckinDetails.assigned_rooms = assignedRooms;
        nextCheckinDetails.assigned_room = assignedRooms[0];
      } else {
        nextCheckinDetails.assigned_rooms = [];
        nextCheckinDetails.assigned_room = null;
      }

      const existingPricingLines = Array.isArray(booking.rooms_allocated)
        ? booking.rooms_allocated
        : [];
      let nextRoomsAllocated: any[] | null = null;

      const updateDoc: Record<string, unknown> = {
        checkin_details: nextCheckinDetails,
        updated_at: new Date(nowIso),
      };

      if (assignedRooms.length > 0) {
        updateDoc.room_id = assignedRooms[0].id;

        // Exactly the rooms chosen now. Merging with the previous room_ids is what kept an un-ticked room
        // attached to the booking.
        updateDoc.room_ids = assignedRooms.map((room) => room.id).filter(Boolean);

        const mergedLines: any[] = [];
        const loopMax = Math.max(
          existingPricingLines.length,
          assignedRooms.length,
        );
        for (let index = 0; index < loopMax; index += 1) {
          const source = existingPricingLines[index] ?? {};
          const assignedRoom = assignedRooms[index] ?? null;
          if (assignedRoom) {
            const resolvedType =
              assignedRoom.type ?? source.type ?? source.room_type ?? null;
            mergedLines.push({
              ...source,
              room_id: assignedRoom.id,
              code: assignedRoom.code ?? source.code ?? null,
              type: resolvedType ?? source.type ?? null,
              room_type:
                resolvedType ?? source.room_type ?? source.type ?? null,
              assigned_at:
                assignedRoom.assigned_at ?? source.assigned_at ?? nowIso,
            });
          } else {
            mergedLines.push({
              ...source,
              room_id: null,
              code: null,
              type: source.type ?? source.room_type ?? null,
              room_type: source.room_type ?? source.type ?? null,
              assigned_at: null,
            });
          }
        }
        nextRoomsAllocated = mergedLines;
      } else {
        updateDoc.room_id = null;
        updateDoc.room_ids = [];
        if (existingPricingLines.length > 0) {
          nextRoomsAllocated = existingPricingLines.map((line: any) => ({
            ...line,
            room_id: null,
            assigned_at: null,
          }));
        }
      }

      if (markAsCheckedIn) {
        updateDoc.status = "CHECKED_IN";
        updateDoc.checked_in_at = new Date(nowIso);
      }

      if (nextRoomsAllocated) {
        updateDoc.rooms_allocated = nextRoomsAllocated;
      }

      await bookingsCollection.updateOne(bookingFilter, { $set: updateDoc });

      const updatedBooking = await bookingsCollection.findOne(bookingFilter);
      const refreshedAvailability = await computeAvailableRooms(
        db,
        updatedBooking ?? booking,
      );

      const responseBooking = serialiseBookingDetailed(
        updatedBooking ?? booking,
        isPrivileged,
      );
      const responseDetails = await hydrateCheckinDetails(
        (updatedBooking ?? booking)?.checkin_details ?? nextCheckinDetails,
      );

      return {
        booking: responseBooking,
        checkinDetails: responseDetails,
        availableRooms: refreshedAvailability,
      };
    }

    if (action === "lookup") {
      const bookingCode = normaliseString(request.bookingCode).toUpperCase();
      const lastName = normaliseString(request.lastName);

      if (!bookingCode) {
        throw new HttpError(400, "bookingCode is required");
      }

      const booking = await bookingsCollection.findOne({
        booking_code: bookingCode,
      });

      if (!booking) {
        throw new HttpError(404, "Booking not found");
      }

      const ownsBooking =
        Boolean(account) &&
        (String(booking.user_id ?? "") === account!.id ||
          (Boolean(account!.email) &&
            normaliseString(booking.guest_email).toLowerCase() === account!.email!.toLowerCase()));
      if (!ownsBooking && !matchesLastName(String(booking.guest_name ?? ""), lastName)) {
        throw new HttpError(404, "Booking not found");
      }

      const status = normaliseString(booking.status).toUpperCase();
      const isReady = status === "CONFIRMED" || status === "CHECKED_IN";
      if (!isReady) {
        throw new HttpError(
          409,
          "Booking not yet confirmed. Please reach out to the front desk for help.",
        );
      }

      const locked = isCheckinLocked(booking);
      // The verified owner of an editable booking may see (and edit) the full record; anyone else, and
      // everyone once it is locked, gets a summary without images, numbers or signatures.
      const details = ownsBooking && !locked
        ? await hydrateCheckinDetails(booking.checkin_details ?? null)
        : summariseCheckin(booking.checkin_details as any);

      return {
        booking: serialiseBookingDetailed({ ...booking, checkin_details: details } as Record<string, unknown>),
        checkinDetails: details,
        locked,
      };
    }

    throw new HttpError(400, "Invalid action");
  }

  async billing(request: BillingRequest, user: AuthenticatedUser) {
    if (!user.roles.includes("admin") && !user.roles.includes("rooms")) {
      throw new HttpError(403, "Insufficient permissions to view billing");
    }

    const bookingIdRaw = request.bookingId;
    if (!bookingIdRaw) {
      throw new HttpError(400, "bookingId is required");
    }

    const booking = await mongoConnection
      .getDb()
      .collection<BookingRecord>("bookings")
      .findOne({ _id: ensureObjectId(bookingIdRaw, "Invalid booking id") });
    if (!booking) {
      throw new HttpError(404, "Booking not found");
    }

    const checkout = request.action === "checkout";
    const payments = checkout ? parsePayments(request.payments) : [];
    return this.summariseBooking(booking, checkout, true, payments, user);
  }

  /**
   * An owner's view of their own invoice, available once the stay has ended. The same folio staff
   * print: charges, itemised food, requests, rooms and every guest's verification.
   */
  async invoiceForOwner(
    request: { bookingId?: string },
    account: { id: string; email?: string },
  ) {
    const bookingId = normaliseString(request?.bookingId);
    if (!bookingId) throw new HttpError(400, "bookingId is required");

    const booking = await mongoConnection
      .getDb()
      .collection<BookingRecord>("bookings")
      .findOne({ _id: ensureObjectId(bookingId, "Invalid booking id") });

    const ownsBooking =
      Boolean(booking) &&
      (String(booking!.user_id ?? "") === account.id ||
        (Boolean(account.email) &&
          normaliseString(booking!.guest_email).toLowerCase() === account.email!.toLowerCase()));
    // Not found and not yours look the same, so booking ids cannot be probed.
    if (!booking || !ownsBooking) throw new HttpError(404, "Booking not found");

    if (normaliseString(booking.status).toUpperCase() !== "CHECKED_OUT") {
      throw new HttpError(409, "Your invoice is available after check-out.");
    }
    return this.summariseBooking(booking, false, false, [], null);
  }

  private async summariseBooking(
    booking: BookingRecord,
    checkout: boolean,
    forStaff: boolean,
    payments: PaymentLine[],
    user: AuthenticatedUser | null,
  ) {
    const db = mongoConnection.getDb();
    const bookingsCollection = db.collection<BookingRecord>("bookings");
    const roomsCollection = db.collection<RoomRecord>("rooms_tables");
    const outletsCollection = db.collection<OutletRecord>("outlets");
    const ordersCollection = db.collection<OrderDocument>("orders");
    const bookingFilter: import("mongodb").Filter<BookingRecord> = { _id: booking._id };

    const room = booking.room_id
      ? await roomsCollection.findOne({
          _id: resolveDocumentId(booking.room_id, "Invalid room id"),
        })
      : null;
    const outlet = booking.outlet_id
      ? await outletsCollection.findOne({
          _id: resolveDocumentId(booking.outlet_id, "Invalid outlet id"),
        })
      : null;

    const bookingIdString = stringifyId(booking._id) ?? booking._id;
    const bookingIdentifiers: Array<string | import("mongodb").ObjectId> = [];
    if (bookingIdString) bookingIdentifiers.push(String(bookingIdString));
    const bookingObj = toObjectId(bookingIdString);
    if (bookingObj) bookingIdentifiers.push(bookingObj);

    const orders = await ordersCollection
      .find({ booking_id: { $in: bookingIdentifiers } } as Record<
        string,
        unknown
      >)
      .sort({ created_at: -1 })
      .toArray();

    const filteredOrders = orders.filter((order) =>
      ORDER_STATUSES_TO_INCLUDE.has(order.status ?? ""),
    );

    let foodTotal = filteredOrders.reduce((sum, order) => {
      const orderTotal = toNumber(order.total, toNumber(order.subtotal));
      return sum + orderTotal;
    }, 0);

    const checkIn = booking.check_in_date
      ? new Date(booking.check_in_date as string | number | Date)
      : null;
    const checkOut = booking.check_out_date
      ? new Date(booking.check_out_date as string | number | Date)
      : null;
    let nights = 1;
    if (
      checkIn &&
      checkOut &&
      !Number.isNaN(checkIn.getTime()) &&
      !Number.isNaN(checkOut.getTime())
    ) {
      const diff = Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
      );
      nights = Math.max(diff, 1);
    }

    const allocatedRoomTotal = Array.isArray(booking.rooms_allocated)
      ? booking.rooms_allocated.reduce((sum: number, line: any) => {
          const lineTotal =
            toNumber(line.total) ||
            toNumber(line.effective_rate) *
              toNumber(line?.perNight?.length ?? booking.nights ?? 1, 1);
          return sum + lineTotal;
        }, 0)
      : 0;

    const storedRoomPortion =
      toNumber(booking.folio_total) - toNumber(booking.food_total);
    let roomTotal =
      allocatedRoomTotal > 0
        ? allocatedRoomTotal
        : storedRoomPortion > 0
          ? storedRoomPortion
          : toNumber(booking.total_amount);

    if (roomTotal <= 0) {
      const nightlyRate = toNumber(
        booking.room_rate ?? booking.rate_per_night ?? room?.price_per_night,
      );
      if (nightlyRate > 0) {
        roomTotal = nightlyRate * nights;
      }
    }
    if (roomTotal <= 0 && room?.price_per_night) {
      roomTotal = toNumber(room.price_per_night) * nights;
    }
    if (roomTotal < 0) roomTotal = 0;

    // Once checked out, the bill is what was finalised then, whatever the live rates say now.
    const frozen = String(booking.status).toUpperCase() === "CHECKED_OUT" && booking.gst ? (booking.gst as GstSummary) : null;
    if (frozen) {
      roomTotal = toNumber(booking.checkout_room_total, roomTotal);
      foodTotal = toNumber(booking.food_total, foodTotal);
    }

    const roomLines = (Array.isArray(booking.rooms_allocated) ? booking.rooms_allocated : []).map((line: any) => ({
      amount: toNumber(line.total) || toNumber(line.effective_rate) * toNumber(line?.perNight?.length ?? booking.nights ?? 1, 1),
      tariff: toNumber(line.effective_rate_per_night ?? line.effective_rate ?? line.base_rate),
    }));
    const gst =
      frozen ??
      computeGst({
        roomTotal,
        foodTotal,
        nights,
        roomLines,
        roomCount: Math.max(assignedRoomIds(booking).length, roomLines.length, toNumber(booking.rooms_requested), 1),
      });
    const subtotal = Math.round((roomTotal + foodTotal) * 100) / 100;
    const grandTotal = gst.total;

    if (checkout) {
      if (String(booking.status).toUpperCase() !== "CHECKED_IN") {
        throw new HttpError(409, "Only a checked-in booking can be checked out.");
      }
      const paid = Math.round(payments.reduce((sum, entry) => sum + entry.amount, 0) * 100) / 100;
      if (Math.abs(paid - grandTotal) > 0.009) {
        throw new HttpError(
          400,
          `Payments add up to ${paid.toFixed(2)} but the total payable is ${grandTotal.toFixed(2)}. Adjust the amounts and try again.`,
        );
      }
      const now = new Date();
      const received = { id: user?.id ?? "unknown", name: user?.name ?? "Staff" };
      await bookingsCollection.updateOne(bookingFilter, {
        $set: {
          status: "CHECKED_OUT",
          checked_out_at: now,
          food_total: foodTotal,
          checkout_room_total: roomTotal,
          subtotal,
          gst,
          folio_total: grandTotal,
          payments,
          payment_status: "PAID",
          paid_at: now,
          payment_received_by: received,
          updated_at: now,
        },
      });
      Object.assign(booking, {
        status: "CHECKED_OUT",
        checked_out_at: now,
        food_total: foodTotal,
        checkout_room_total: roomTotal,
        subtotal,
        gst,
        folio_total: grandTotal,
        payments,
        payment_status: "PAID",
        paid_at: now,
        payment_received_by: received,
        updated_at: now,
      });
    }

    // What was actually ordered, for the itemised invoice.
    const orderIds = filteredOrders.map((order) => stringifyId(order._id)).filter((id): id is string => Boolean(id));
    const itemDocs = orderIds.length
      ? await db.collection("order_items").find({ order_id: { $in: orderIds } }).toArray()
      : [];
    const menuKeys = Array.from(new Set(itemDocs.map((item) => stringifyId(item.menu_item_id)).filter((id): id is string => Boolean(id))));
    const menuDocs = menuKeys.length
      ? await db
          .collection("menu_items")
          .find({ _id: { $in: [...menuKeys.map((id) => toObjectId(id)).filter(Boolean), ...menuKeys] } as any })
          .project({ name: 1 })
          .toArray()
      : [];
    const menuNames = new Map(menuDocs.map((doc) => [stringifyId(doc._id) ?? "", String(doc.name ?? "Item")]));
    const itemsByOrder = new Map<string, Array<{ name: string; quantity: number; price: number; notes: string | null }>>();
    for (const item of itemDocs) {
      const key = String(item.order_id);
      const list = itemsByOrder.get(key) ?? [];
      list.push({
        name: menuNames.get(stringifyId(item.menu_item_id) ?? "") ?? "Item",
        quantity: toNumber(item.quantity, 1),
        price: toNumber(item.price),
        notes: typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : null,
      });
      itemsByOrder.set(key, list);
    }

    const serialiseOrder = (order: OrderDocument) => {
      const { _id, ...rest } = order;
      const id = typeof _id === "string" ? _id : _id?.toString?.();
      return { id, ...rest, items: itemsByOrder.get(String(id)) ?? [] };
    };

    const normalisedBooking = normaliseBooking(booking, forStaff);
    if (normalisedBooking?.checkin_details) {
      normalisedBooking.checkin_details = await hydrateCheckinDetails(normalisedBooking.checkin_details);
    }

    return {
      booking: {
        ...normalisedBooking,
        rooms_tables: serialiseEmbedded(room),
        outlets: serialiseEmbedded(outlet),
      },
      foodTotal,
      roomTotal,
      /** Room plus food before GST. */
      subtotal,
      gst,
      /** What the guest pays: GST included, rounded to the rupee. */
      grandTotal,
      orders: filteredOrders.map(serialiseOrder),
    };
  }
}

export const bookingService = new BookingService();
