import { mongoConnection } from "../../mongo";
import { assertCheckinId, findCheckedInBookingForRoom } from "../../utils/checkinId";
import { HttpError } from "../../httpError";
import { stringifyId, toObjectId } from "../../utils/objectId";
import {
  BookingSummary,
  LocationSummary,
  OutletSummary,
  ValidateLocationRequest,
  ValidateLocationResponse,
} from "./location.types";

const normalizeOutlet = (doc: any): OutletSummary | null => {
  if (!doc) return null;
  return {
    id: stringifyId(doc._id) ?? stringifyId(doc.id) ?? "",
    name: typeof doc.name === "string" ? doc.name : doc.location_key ?? null,
    location_key: typeof doc.location_key === "string" ? doc.location_key : null,
  };
};

const normalizeLocation = (doc: any): LocationSummary | null => {
  if (!doc) return null;
  return {
    id: stringifyId(doc._id) ?? stringifyId(doc.id) ?? "",
    code: doc.code,
    type: doc.type,
    outlet_id: doc.outlet_id,
  };
};

const normalizeBooking = (doc: any): BookingSummary | null => {
  if (!doc) return null;
  return {
    id: stringifyId(doc._id) ?? stringifyId(doc.id) ?? "",
    guest_name: doc.guest_name,
    status: doc.status,
    check_in_date: doc.check_in_date,
    check_out_date: doc.check_out_date,
    booking_code: doc.booking_code,
    room_total: doc.total_amount ?? doc.room_total ?? 0,
    rooms_allocated: doc.rooms_allocated ?? [],
  };
};

export class LocationService {
  async validate(payload: ValidateLocationRequest): Promise<ValidateLocationResponse> {
    const db = mongoConnection.getDb();
    const outletsCollection = db.collection("outlets");
    const roomsCollection = db.collection("rooms_tables");

    const { code, type, outletId } = payload;

    const trimmedCode = code?.trim() ?? "";
    const trimmedType = type?.toString().trim() ?? "";
    const trimmedOutletId = outletId?.trim() ?? "";

    if (!trimmedCode && !trimmedType && !trimmedOutletId) {
      const outlets = await outletsCollection
        .find({ is_active: true }, { projection: { location_key: 1, name: 1 } })
        .toArray();
      return {
        outlet: outlets
          .map(normalizeOutlet)
          .filter((entry): entry is OutletSummary => Boolean(entry?.id)),
      };
    }

    if (!trimmedCode || !trimmedType || !trimmedOutletId) {
      return {
        valid: false,
        message: "code, type and outletId are required",
        location: null,
        outlet: null,
      };
    }

    const outletObjectId = toObjectId(trimmedOutletId);
    const outletDoc = await outletsCollection.findOne({
      is_active: true,
      $or: [
        { location_key: trimmedOutletId },
        ...(outletObjectId ? [{ _id: outletObjectId }] : []),
      ],
    });

    if (!outletDoc) {
      return {
        valid: false,
        message: "Invalid outlet",
        location: null,
        outlet: null,
      };
    }

    const resolvedOutletKey = outletDoc.location_key ?? trimmedOutletId;
    const normalizedType = trimmedType.toUpperCase();

    const locationDoc = await roomsCollection.findOne({
      code: trimmedCode,
      type: normalizedType,
      is_active: true,
      outlet_id: resolvedOutletKey,
    });

    if (!locationDoc) {
      return {
        valid: false,
        message: "Invalid room or table code",
        location: null,
        outlet: normalizeOutlet(outletDoc),
      };
    }

    let bookingPayload: BookingSummary | null = null;
    let requiresCheckinId = false;
    if (normalizedType === "ROOM" || normalizedType === "HOTEL_ROOM") {
      // A room's details are only shown to someone who knows the stay's 6-digit check-in ID. Without
      // it nothing about the room's occupant is revealed, and a wrong ID looks the same as no stay.
      const roomIdStr = stringifyId(locationDoc._id) ?? "";
      if (!payload.checkinId) {
        requiresCheckinId = true;
      } else {
        const booking = await findCheckedInBookingForRoom(db, roomIdStr, resolvedOutletKey);
        await assertCheckinId(db, `room:${roomIdStr}`, booking, payload.checkinId);
        bookingPayload = normalizeBooking(booking);
      }
    }

    return {
      valid: true,
      location: normalizeLocation(locationDoc),
      outlet: normalizeOutlet(outletDoc),
      booking: bookingPayload,
      requiresCheckinId,
    };
  }
}

export const locationService = new LocationService();
