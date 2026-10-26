import { assertAdmin, assertOutlet, isAdmin, outletFilter } from "../../utils/access";
import { mongoConnection } from "../../mongo";
import { assignedRoomIds, bookingViewForWindow } from "../../utils/roomAssignments";
import { HttpError } from "../../httpError";
import { AuthenticatedUser } from "../../session";
import { normalizeDocument } from "../../utils/normalizers";
import { toObjectId } from "../../utils/objectId";

const ACTIVE_BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CHECKED_IN"];
const ROOM_TYPES = ["ROOM", "room", "HOTEL_ROOM", "hotel_room"];
const DAY_IN_MS = 86_400_000;

const toStringId = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  try {
    const str = (value as { toString?: () => string })?.toString?.();
    return str && str !== "[object Object]" ? str : null;
  } catch {
    return null;
  }
};

const normaliseCategoryKey = (value: unknown): string => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const resolveCategoryName = (room: Record<string, unknown>): string => {
  const raw = typeof room?.room_type === "string" ? room.room_type.trim() : room?.room_type;
  if (raw && String(raw).length > 0) return String(raw);
  const type = String(room?.type ?? "").toUpperCase();
  if (type === "ROOM" || type === "HOTEL_ROOM") return "Standard Room";
  return (room?.type as string) ?? "Room";
};

const extractAssignedRoomIds = (booking: Record<string, unknown>): Set<string> => new Set(assignedRoomIds(booking));

const extractPreferredCategoryCounts = (booking: Record<string, unknown>): Map<string, number> => {
  const map = new Map<string, number>();
  const raw = booking?.preferred_categories;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      const count = Number(value);
      if (!Number.isFinite(count) || count <= 0) return;
      const normalised = normaliseCategoryKey(key);
      if (!normalised) return;
      map.set(normalised, (map.get(normalised) ?? 0) + Math.floor(count));
    });
  } else if (Array.isArray(booking?.rooms_allocated)) {
    booking.rooms_allocated.forEach((entry: any) => {
      const label = entry?.room_type ?? entry?.type ?? entry?.category;
      const normalised = normaliseCategoryKey(label);
      if (!normalised) return;
      map.set(normalised, (map.get(normalised) ?? 0) + 1);
    });
  } else if (booking?.preferred_room_type) {
    const normalised = normaliseCategoryKey(booking.preferred_room_type);
    if (normalised) {
      map.set(normalised, (map.get(normalised) ?? 0) + 1);
    }
  }

  return map;
};

const determineRoomsRequested = (booking: Record<string, unknown>, assignedCount: number): number => {
  const checkinDetails = (booking?.checkin_details ??
    {}) as { assigned_rooms?: unknown[] } | null;
  const counts = [
    Number(booking?.rooms_requested ?? 0),
    Number(booking?.roomsRequested ?? 0),
    Array.isArray(booking?.preferred_room_ids) ? booking.preferred_room_ids.length : 0,
    Array.isArray(booking?.room_ids) ? booking.room_ids.length : 0,
    Array.isArray(booking?.rooms_allocated) ? booking.rooms_allocated.length : 0,
    Array.isArray(checkinDetails?.assigned_rooms)
      ? checkinDetails.assigned_rooms.length
      : 0,
  ].filter((value) => Number.isFinite(value) && Number(value) > 0);

  const requested = counts.length
    ? Math.max(...counts.map((value) => Math.floor(Number(value))))
    : 0;

  if (requested > assignedCount) return requested;
  if (assignedCount > 0) return assignedCount;
  return 1;
};

const collectExistingHolds = (bookings: Record<string, unknown>[]) => {
  const assignedIds = new Set<string>();
  const holdMap = new Map<string, number>();
  let genericHold = 0;

  bookings.forEach((booking) => {
    const assigned = extractAssignedRoomIds(booking);
    assigned.forEach((id) => assignedIds.add(id));

    const assignedCount = assigned.size;
    const requestedCount = determineRoomsRequested(booking, assignedCount);
    const outstanding = Math.max(requestedCount - assignedCount, 0);
    if (outstanding <= 0) return;

    const preferredCategories = extractPreferredCategoryCounts(booking);
    let remaining = outstanding;

    if (preferredCategories.size > 0) {
      for (const [categoryKey, count] of preferredCategories.entries()) {
        if (remaining <= 0) break;
        const allocation = Math.min(count, remaining);
        holdMap.set(categoryKey, (holdMap.get(categoryKey) ?? 0) + allocation);
        remaining -= allocation;
      }
    } else if (booking?.preferred_room_type) {
      const key = normaliseCategoryKey(booking.preferred_room_type);
      if (key) {
        holdMap.set(key, (holdMap.get(key) ?? 0) + remaining);
        remaining = 0;
      }
    }

    if (remaining > 0) {
      genericHold += remaining;
    }
  });

  return { assignedIds, holdMap, genericHold };
};

const reserveForExistingHolds = (
  rooms: Array<{ id: string | null; normalisedCategory: string }>,
  holdMap: Map<string, number>,
  genericHold: number,
) => {
  const reservedIds = new Set<string>();
  let remainingGeneric = genericHold;

  const buckets = new Map<string, Array<{ id: string | null; normalisedCategory: string }>>();
  rooms.forEach((entry) => {
    if (!entry.id) return;
    const current = buckets.get(entry.normalisedCategory) ?? [];
    current.push(entry);
    buckets.set(entry.normalisedCategory, current);
  });

  holdMap.forEach((count, categoryKey) => {
    if (count <= 0) return;
    const bucket = buckets.get(categoryKey) ?? [];
    let used = 0;
    for (const entry of bucket) {
      if (!entry.id || reservedIds.has(entry.id)) continue;
      reservedIds.add(entry.id);
      used += 1;
      if (used >= count) break;
    }
    if (used < count) {
      remainingGeneric += count - used;
    }
  });

  if (remainingGeneric > 0) {
    for (const entry of rooms) {
      if (!entry.id || reservedIds.has(entry.id)) continue;
      reservedIds.add(entry.id);
      remainingGeneric -= 1;
      if (remainingGeneric <= 0) break;
    }
  }

  return {
    reservedIds,
    shortage: remainingGeneric > 0 ? remainingGeneric : 0,
  };
};

export const computePricingForRoom = (
  room: Record<string, unknown>,
  pricingRules: Record<string, unknown>[],
  checkIn: Date,
  checkOut: Date,
  nights: number,
) => {
  const base = Number(room.price_per_night ?? 0);
  let total = 0;
  const perNight: Array<{ date: string; rate: number; percent: number }> = [];

  for (let ts = checkIn.getTime(); ts < checkOut.getTime(); ts += DAY_IN_MS) {
    const date = new Date(ts);
    const applicable = pricingRules.filter((rule: any) => {
      const start = rule.start_date ? new Date(rule.start_date) : null;
      const end = rule.end_date ? new Date(rule.end_date) : null;
      if (start && date < start) return false;
      if (end && date > end) return false;
      const roomIds = Array.isArray(rule.room_ids) ? rule.room_ids : [];
      if (roomIds.length === 0) return true;
      const roomId = room._id?.toString?.() ?? room._id;
      return roomIds.includes(roomId) || roomIds.includes(String(roomId));
    });

    const isFixed = (rule: any) => String(rule.mode ?? "").toUpperCase() === "FIXED";
    // A fixed-rate rule replaces the nightly base; the newest one wins. Percent rules stack on top.
    const fixedRule = applicable
      .filter((rule: any) => isFixed(rule) && Number(rule.fixed_rate) > 0)
      .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0] as any;
    const nightlyBase = fixedRule ? Number(fixedRule.fixed_rate) : base;

    const totalPercent = applicable.reduce(
      (acc: number, rule: any) => (isFixed(rule) ? acc : acc + Number(rule.percent_increase ?? 0)),
      0,
    );
    const nightlyRate = Number((nightlyBase * (1 + totalPercent / 100)).toFixed(2));
    total += nightlyRate;
    perNight.push({ date: date.toISOString(), rate: nightlyRate, percent: totalPercent });
  }

  const effectiveRate = total / nights || base;
  return {
    occupancy: Number(room.occupancy ?? 2),
    effective_rate_per_night: Number(effectiveRate.toFixed(2)),
    effective_total: Number(total.toFixed(2)),
    per_night_breakdown: perNight,
  };
};

type AvailabilityRequest = {
  outlet_id?: string;
  check_in_date?: string;
  check_out_date?: string;
};

type ManageRoomsRequest = {
  action: "list" | "create" | "update" | "delete";
  data?: Record<string, unknown>;
  id?: string;
};

type ManagePricingRequest = {
  action: "list" | "create" | "update" | "delete";
  rule?: Record<string, unknown>;
  id?: string;
};

const normaliseRoomDocument = (doc: Record<string, unknown>) => {
  const normalized = normalizeDocument(doc);
  if (!normalized) return null;
  return normalized;
};

const sanitiseRoomPayload = (input: Record<string, unknown>) => {
  const now = new Date();
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const outletId = typeof input.outlet_id === "string" ? input.outlet_id.trim() : "";
  if (!code || !outletId) {
    throw new HttpError(400, "code and outlet_id are required");
  }

  const type = typeof input.type === "string" ? input.type : "ROOM";
  const occupancyRaw = Number(input.occupancy ?? 0);
  const occupancy = Number.isFinite(occupancyRaw) && occupancyRaw > 0 ? occupancyRaw : 2;
  const isTable = type.toUpperCase() === "TABLE";
  const priceRaw = Number(input.price_per_night ?? 0);
  // Rooms are sold by the night and need a rate; a table is not and has none.
  if (!isTable && (!Number.isFinite(priceRaw) || priceRaw <= 0)) {
    throw new HttpError(400, "price_per_night must be a positive number");
  }

  const amenities = Array.isArray(input.amenities)
    ? Array.from(
        new Set(
          input.amenities
            .map((entry) => (typeof entry === "string" ? entry.trim() : null))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      )
    : [];

  return {
    code,
    outlet_id: outletId,
    type,
    room_type: typeof input.room_type === "string" ? input.room_type.trim() : undefined,
    price_per_night: isTable ? 0 : Number(priceRaw.toFixed(2)),
    occupancy,
    is_active: input.is_active !== false,
    amenities,
    level: typeof input.level === "string" ? input.level.trim() : input.level,
    description: typeof input.description === "string" ? input.description : undefined,
    updated_at: now,
    created_at: input.created_at instanceof Date ? input.created_at : now,
  };
};

const normaliseRoomIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") return entry;
      if (typeof entry === "object" && "$oid" in (entry as Record<string, unknown>)) {
        return String((entry as { $oid?: string }).$oid ?? "");
      }
      try {
        return toStringId(entry);
      } catch {
        return null;
      }
    })
    .filter((entry): entry is string => Boolean(entry));
};

const sanitisePricingPayload = (rule: Record<string, unknown>) => {
  if (!rule?.outlet_id || typeof rule.outlet_id !== "string") {
    throw new HttpError(400, "outlet_id is required");
  }

  const now = new Date();
  const modeRaw = typeof rule.mode === "string" ? rule.mode.toUpperCase().trim() : "PERCENT";
  const mode = modeRaw === "FIXED" ? "FIXED" : "PERCENT";
  const percentIncrease = Number(rule.percent_increase ?? 0);
  const fixedRate = Number(rule.fixed_rate ?? 0);
  const appliesTo = typeof rule.applies_to === "string" ? rule.applies_to : undefined;

  const startDate = rule.start_date ? new Date(String(rule.start_date)) : now;
  const endDate = rule.end_date ? new Date(String(rule.end_date)) : null;

  if (Number.isNaN(startDate.getTime())) {
    throw new HttpError(400, "Invalid start_date");
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new HttpError(400, "Invalid end_date");
  }

  return {
    outlet_id: rule.outlet_id,
    room_ids: normaliseRoomIds(rule.room_ids),
    mode,
    percent_increase: Number(percentIncrease.toFixed(2)),
    fixed_rate: mode === "FIXED" ? Number(fixedRate.toFixed(2)) : undefined,
    applies_to: appliesTo ?? (Array.isArray(rule.room_ids) && rule.room_ids.length > 0 ? "ROOMS" : "OUTLET"),
    start_date: startDate,
    end_date: endDate,
    notes: typeof rule.notes === "string" ? rule.notes : "",
    created_at: now,
    updated_at: now,
  };
};

export class RoomService {
  async getAvailability(payload: AvailabilityRequest) {
    const { outlet_id, check_in_date, check_out_date } = payload;
    if (!outlet_id || !check_in_date || !check_out_date) {
      throw new HttpError(400, "outlet_id, check_in_date and check_out_date are required");
    }

    const checkIn = new Date(check_in_date);
    const checkOut = new Date(check_out_date);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      throw new HttpError(400, "Invalid check-in or check-out date");
    }
    if (checkOut <= checkIn) {
      throw new HttpError(400, "Check-out must be after check-in");
    }

    const db = mongoConnection.getDb();
    const roomsCollection = db.collection("rooms_tables");
    const pricingCollection = db.collection("room_pricing_rules");
    const bookingsCollection = db.collection("bookings");

    const roomsRaw = await roomsCollection
      .find({
        outlet_id,
        is_active: true,
        type: { $in: ROOM_TYPES },
      })
      .toArray();

    const overlappingBookings = await bookingsCollection
      .find({
        outlet_id,
        status: { $in: ACTIVE_BOOKING_STATUSES },
      })
      .toArray();

    const relevantBookings = overlappingBookings.filter((booking: any) => {
      const bookingCheckIn = booking?.check_in_date ? new Date(booking.check_in_date) : null;
      const bookingCheckOut = booking?.check_out_date ? new Date(booking.check_out_date) : null;
      if (
        bookingCheckIn &&
        bookingCheckOut &&
        !Number.isNaN(bookingCheckIn.getTime()) &&
        !Number.isNaN(bookingCheckOut.getTime())
      ) {
        return bookingCheckIn <= checkOut && bookingCheckOut >= checkIn;
      }
      return true;
    });

    const { assignedIds, holdMap, genericHold } = collectExistingHolds(
      relevantBookings.map((booking: any) => bookingViewForWindow(booking, checkIn, checkOut)),
    );

    const evaluatedRooms = (roomsRaw ?? []).map((room: Record<string, unknown>) => {
      const id = toStringId(room?._id);
      const category = resolveCategoryName(room);
      return {
        room,
        id,
        category,
        normalisedCategory: normaliseCategoryKey(category),
      };
    });

    const availableRooms = evaluatedRooms.filter(
      (entry) => !entry.id || !assignedIds.has(entry.id),
    );

    const holdReservation = reserveForExistingHolds(
      availableRooms.map(({ id, normalisedCategory }) => ({ id, normalisedCategory })),
      holdMap,
      genericHold,
    );

    const unheldRooms =
      holdReservation.shortage > 0
        ? []
        : availableRooms.filter(
            (entry) => !entry.id || !holdReservation.reservedIds.has(entry.id),
          );

    const pricingRules = await pricingCollection
      .find({
        outlet_id,
        $or: [
          { end_date: { $gte: checkIn } },
          { end_date: { $exists: false } },
          { end_date: null },
        ],
        start_date: { $lte: checkOut },
      })
      .toArray();

    const nights = Math.max(Math.ceil((checkOut.getTime() - checkIn.getTime()) / DAY_IN_MS), 1);

    const pricedRooms = unheldRooms.map(({ room }) => {
      const pricing = computePricingForRoom(room, pricingRules, checkIn, checkOut, nights);
      const id = toStringId(room?._id);
      const { _id, ...rest } = room;
      return {
        id,
        ...rest,
        occupancy: pricing.occupancy,
        effective_rate_per_night: pricing.effective_rate_per_night,
        effective_total: pricing.effective_total,
        per_night_breakdown: pricing.per_night_breakdown,
      };
    });

    pricedRooms.sort(
      (a: any, b: any) =>
        (a.effective_rate_per_night ?? a.price_per_night ?? 0) -
        (b.effective_rate_per_night ?? b.price_per_night ?? 0),
    );

    const categoriesMap = new Map<
      string,
      {
        category: string;
        rooms: any[];
        available_count: number;
        min_rate: number;
        max_rate: number;
        max_occupancy: number;
        amenities: string[];
      }
    >();

    pricedRooms.forEach((room: any) => {
      const category =
        (room.room_type && String(room.room_type).trim()) ||
        (room.room_type && String(room.room_type)) ||
        (room.type === "ROOM" ? "Standard Room" : room.type);
      const key = category || "Standard Room";
      const existing = categoriesMap.get(key);
      const roomAmenities = Array.isArray(room.amenities)
        ? room.amenities.map((item: unknown) => String(item))
        : [];
      if (!existing) {
        categoriesMap.set(key, {
          category: key,
          rooms: [room],
          available_count: 1,
          min_rate: Number(room.effective_rate_per_night ?? room.price_per_night ?? 0),
          max_rate: Number(room.effective_rate_per_night ?? room.price_per_night ?? 0),
          max_occupancy: Number(room.occupancy ?? 2),
          amenities: Array.from(new Set(roomAmenities)),
        });
      } else {
        existing.rooms.push(room);
        existing.available_count += 1;
        const rate = Number(room.effective_rate_per_night ?? room.price_per_night ?? 0);
        existing.min_rate = Math.min(existing.min_rate, rate);
        existing.max_rate = Math.max(existing.max_rate, rate);
        existing.max_occupancy = Math.max(existing.max_occupancy, Number(room.occupancy ?? 2));
        existing.amenities = Array.from(new Set([...existing.amenities, ...roomAmenities]));
        categoriesMap.set(key, existing);
      }
    });

    const categories = Array.from(categoriesMap.values())
      .map((entry) => ({
        category: entry.category,
        available_count: entry.available_count,
        min_rate: Number(entry.min_rate.toFixed(2)),
        max_rate: Number(entry.max_rate.toFixed(2)),
        max_occupancy: entry.max_occupancy,
        amenities: entry.amenities,
        room_ids: entry.rooms
          .map((room: any) => room.id)
          .filter((value: unknown): value is string => typeof value === "string"),
      }))
      .sort((a, b) => a.min_rate - b.min_rate);

    const summary = {
      nights,
      available_count: pricedRooms.length,
      min_rate: pricedRooms.length
        ? Math.min(
            ...pricedRooms.map((r: any) =>
              Number(r.effective_rate_per_night ?? r.price_per_night ?? 0),
            ),
          )
        : 0,
      max_rate: pricedRooms.length
        ? Math.max(
            ...pricedRooms.map((r: any) =>
              Number(r.effective_rate_per_night ?? r.price_per_night ?? 0),
            ),
          )
        : 0,
    };

    return {
      rooms: pricedRooms,
      summary,
      categories,
    };
  }

  async manageRooms(payload: ManageRoomsRequest, user: AuthenticatedUser) {
    const { action, data, id } = payload;
    const db = mongoConnection.getDb();
    const roomsCollection = db.collection("rooms_tables");

    switch (action) {
      case "list": {
        const filter: Record<string, unknown> = outletFilter(user);
        const roomsRaw = await roomsCollection.find(filter).sort({ created_at: -1 }).toArray();
        const rooms = roomsRaw.map((doc: Record<string, unknown>) => ({
          ...doc,
          id: toStringId(doc._id) ?? doc._id,
        }));
        return { rooms };
      }

      case "create": {
        assertAdmin(user, "add rooms or tables");
        if (!data || typeof data !== "object") {
          throw new HttpError(400, "data payload is required");
        }
        const payloadDoc = sanitiseRoomPayload(data as Record<string, unknown>);
        assertOutlet(user, payloadDoc.outlet_id);
        const insertResult = await roomsCollection.insertOne(payloadDoc);
        return {
          id: toStringId(insertResult.insertedId) ?? String(insertResult.insertedId),
          ...payloadDoc,
        };
      }

      case "update": {
        if (!id || !data || typeof data !== "object") {
          throw new HttpError(400, "id and data are required for update");
        }
        const objectId = toObjectId(id);
        if (!objectId) {
          throw new HttpError(400, "Invalid room id");
        }
        const existing = await roomsCollection.findOne({ _id: objectId } as Record<string, unknown>);
        if (!existing) {
          throw new HttpError(404, "Room not found");
        }
        assertOutlet(user, existing.outlet_id);
        if (!isAdmin(user)) {
          // Everyone else may only switch a room or table on or off; nothing else about it changes.
          const keys = Object.keys(data as Record<string, unknown>);
          if (keys.length !== 1 || keys[0] !== "is_active") {
            throw new HttpError(403, "Only an administrator can edit rooms and tables. You can switch them on or off.");
          }
        }
        const payloadDoc = sanitiseRoomPayload({ ...existing, ...data } as Record<string, unknown>);
        assertOutlet(user, payloadDoc.outlet_id);
        payloadDoc.created_at = existing.created_at ?? payloadDoc.created_at;
        await roomsCollection.updateOne({ _id: objectId } as Record<string, unknown>, {
          $set: {
            ...payloadDoc,
            created_at: existing.created_at ?? payloadDoc.created_at,
            updated_at: new Date(),
          },
        });
        return { success: true };
      }

      case "delete": {
        assertAdmin(user, "remove rooms or tables");
        if (!id) {
          throw new HttpError(400, "id is required for delete");
        }
        const objectId = toObjectId(id);
        if (!objectId) {
          throw new HttpError(400, "Invalid room id");
        }
        const doomed = await roomsCollection.findOne({ _id: objectId } as Record<string, unknown>);
        if (doomed) assertOutlet(user, doomed.outlet_id);
        await roomsCollection.deleteOne({ _id: objectId } as Record<string, unknown>);
        return { success: true };
      }

      default:
        throw new HttpError(400, "Invalid action");
    }
  }

  async managePricing(payload: ManagePricingRequest, user: AuthenticatedUser) {
    const { action, rule, id } = payload;
    const db = mongoConnection.getDb();
    const pricingCollection = db.collection("room_pricing_rules");

    switch (action) {
      case "list": {
        const filter: Record<string, unknown> = outletFilter(user);
        const rules = await pricingCollection.find(filter).sort({ start_date: 1 }).toArray();
        const serialised = rules
          .map((doc: Record<string, unknown>) => {
            const normalised = normaliseRoomDocument(doc);
            if (!normalised) return null;
            return {
              ...normalised,
              room_ids: normaliseRoomIds(doc.room_ids),
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        return { rules: serialised };
      }

      case "create": {
        assertAdmin(user, "change prices");
        if (!rule || typeof rule !== "object") {
          throw new HttpError(400, "rule payload is required");
        }
        const payloadDoc = sanitisePricingPayload(rule as Record<string, unknown>);
        assertOutlet(user, payloadDoc.outlet_id);
        const insertResult = await pricingCollection.insertOne(payloadDoc);
        return {
          id: toStringId(insertResult.insertedId) ?? String(insertResult.insertedId),
          ...payloadDoc,
        };
      }

      case "update": {
        assertAdmin(user, "change prices");
        if (!id || !rule || typeof rule !== "object") {
          throw new HttpError(400, "id and rule are required for update");
        }
        const objectId = toObjectId(id);
        if (!objectId) {
          throw new HttpError(400, "Invalid rule id");
        }
        const existing = await pricingCollection.findOne({ _id: objectId } as Record<string, unknown>);
        if (!existing) {
          throw new HttpError(404, "Pricing rule not found");
        }
        assertOutlet(user, existing.outlet_id);
        const payloadDoc = sanitisePricingPayload({ ...existing, ...rule } as Record<string, unknown>);
        assertOutlet(user, payloadDoc.outlet_id);
        payloadDoc.created_at = existing.created_at ?? payloadDoc.created_at;
        await pricingCollection.updateOne(
          { _id: objectId } as Record<string, unknown>,
          {
            $set: {
              ...payloadDoc,
              created_at: existing.created_at ?? payloadDoc.created_at,
              updated_at: new Date(),
            },
          },
        );
        return { success: true };
      }

      case "delete": {
        assertAdmin(user, "change prices");
        if (!id) {
          throw new HttpError(400, "id is required for delete");
        }
        const objectId = toObjectId(id);
        if (!objectId) {
          throw new HttpError(400, "Invalid rule id");
        }
        const doomed = await pricingCollection.findOne({ _id: objectId } as Record<string, unknown>);
        if (doomed) assertOutlet(user, doomed.outlet_id);
        await pricingCollection.deleteOne({ _id: objectId } as Record<string, unknown>);
        return { success: true };
      }

      default:
        throw new HttpError(400, "Invalid action");
    }
  }
}

export const roomService = new RoomService();
