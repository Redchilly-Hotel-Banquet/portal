import type { Db } from "mongodb";
import { HttpError } from "../../httpError";
import type { AuthenticatedUser } from "../../session";
import { assertAdmin, assertOutlet, isAdmin } from "../../utils/access";
import { assignedRoomIds, currentRoomIds, roomsHeldDuring, staySegments, type StaySegment } from "../../utils/roomAssignments";
import { toObjectId } from "../../utils/objectId";
import { computePricingForRoom } from "../rooms/room.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXTENSION_NIGHTS = 90;
const MAX_ROOMS = 10;
const ACTIVE = ["PENDING", "CONFIRMED", "CHECKED_IN"];
const ROOM_TYPES = ["ROOM", "room", "HOTEL_ROOM", "hotel_room"];

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const nightsBetween = (from: Date, to: Date) => Math.max(Math.round((to.getTime() - from.getTime()) / DAY_MS), 0);

export type ExtendRequest = {
  id?: string;
  /** New day of departure, YYYY-MM-DD. */
  newCheckOut?: string;
  /** Rooms for the added nights. `rate` is optional; only an administrator may differ from the price list. */
  rooms?: Array<{ id?: string; rate?: number | string }>;
  /** update_stay_rate */
  segmentIndex?: number;
  rate?: number | string;
};

const parseDay = (value: unknown): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCDate() === Number(match[3]) ? date : null;
};

const loadBooking = async (db: Db, user: AuthenticatedUser, id: unknown) => {
  const key = String(id ?? "").trim();
  if (!key) throw new HttpError(400, "id is required");
  const booking = await db.collection("bookings").findOne({ _id: (toObjectId(key) ?? key) as any });
  if (!booking) throw new HttpError(404, "Booking not found");
  assertOutlet(user, booking.outlet_id);
  return booking;
};

const loadRooms = async (db: Db, outletId: unknown) =>
  db.collection("rooms_tables").find({ outlet_id: outletId, is_active: { $ne: false }, type: { $in: ROOM_TYPES } }).toArray();

const roomCategory = (room: Record<string, any>) => String(room.room_type ?? room.type ?? "Room");

/**
 * What a stay that has never changed looks like as segments: each room it holds, for the booked dates, with the
 * room total shared across them (by their own rates where the booking has priced lines).
 */
const legacySegments = (booking: Record<string, any>, roomsById: Map<string, Record<string, any>>): StaySegment[] => {
  const from = new Date(booking.check_in_date);
  const to = new Date(booking.check_out_date);
  const nights = Math.max(nightsBetween(from, to), 1);
  const ids = assignedRoomIds(booking);
  if (ids.length === 0) throw new HttpError(409, "This stay has no room assigned yet.");

  const priced: any[] = Array.isArray(booking.rooms_allocated) ? booking.rooms_allocated : [];
  const weights = ids.map((_, index) => {
    const line = priced[index];
    return line ? Math.max(Number(line.total) || Number(line.effective_rate_per_night ?? line.effective_rate ?? line.base_rate ?? 0) * nights, 0) : 0;
  });
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let total = Number(booking.total_amount ?? booking.room_total ?? 0);
  if (!(total > 0)) total = ids.reduce((sum, id) => sum + Number(roomsById.get(id)?.price_per_night ?? 0) * nights, 0);
  const shares = weightSum > 0 ? weights.map((weight) => (weight / weightSum) * total) : ids.map(() => total / ids.length);

  let allocated = 0;
  return ids.map((id, index) => {
    const amount = index === ids.length - 1 ? money(total - allocated) : money(shares[index]);
    allocated += amount;
    const room = roomsById.get(id);
    return {
      room_id: id,
      code: String(room?.code ?? ""),
      type: room ? roomCategory(room) : undefined,
      from,
      to,
      nights,
      rate: money(amount / nights),
      amount,
      kind: "STAY" as const,
    };
  });
};

/** Rooms free on every night of [from, to) apart from this booking's own stay, with the price list's rate for those nights. */
const freeRooms = async (db: Db, booking: Record<string, any>, from: Date, to: Date) => {
  const rooms = await loadRooms(db, booking.outlet_id);
  const others = await db
    .collection("bookings")
    .find({ outlet_id: booking.outlet_id, status: { $in: ACTIVE }, _id: { $ne: booking._id } })
    .toArray();
  const taken = new Set<string>();
  for (const other of others) roomsHeldDuring(other, from, to, false).forEach((id) => taken.add(id));

  const rules = await db
    .collection("room_pricing_rules")
    .find({
      outlet_id: booking.outlet_id,
      $or: [{ end_date: { $gte: from } }, { end_date: { $exists: false } }, { end_date: null }],
      start_date: { $lte: to },
    })
    .toArray();
  const nights = Math.max(nightsBetween(from, to), 1);
  const here = new Set(currentRoomIds(booking));

  return rooms
    .filter((room) => !taken.has(String(room._id)))
    .map((room) => {
      const pricing = computePricingForRoom(room, rules, from, to, nights);
      return {
        id: String(room._id),
        code: String(room.code ?? ""),
        category: roomCategory(room),
        level: room.level ? String(room.level) : null,
        occupancy: Number(room.occupancy ?? 2),
        rate: pricing.effective_rate_per_night,
        currentRoom: here.has(String(room._id)),
      };
    })
    .sort((a, b) => Number(b.currentRoom) - Number(a.currentRoom) || a.code.localeCompare(b.code, "en", { numeric: true }));
};

const window = (booking: Record<string, any>, newCheckOut: unknown) => {
  if (String(booking.status).toUpperCase() !== "CHECKED_IN") {
    throw new HttpError(409, "Only a guest who is checked in can extend their stay.");
  }
  const to = parseDay(newCheckOut);
  if (!to) throw new HttpError(400, "Choose the new check-out date.");
  const from = new Date(booking.check_out_date);
  const added = nightsBetween(from, to);
  if (added < 1) throw new HttpError(400, "The new check-out must be after the current check-out.");
  if (added > MAX_EXTENSION_NIGHTS) throw new HttpError(400, `A stay can be extended by at most ${MAX_EXTENSION_NIGHTS} nights at a time.`);
  return { from, to, added };
};

export const stayExtension = {
  /** Rooms the guest could have for the extra nights, so reception can choose before committing. */
  async options(db: Db, user: AuthenticatedUser, request: ExtendRequest) {
    const booking = await loadBooking(db, user, request.id);
    const { from, to, added } = window(booking, request.newCheckOut);
    return {
      currentCheckOut: from.toISOString(),
      newCheckOut: to.toISOString(),
      nights: added,
      canSetRate: isAdmin(user),
      rooms: await freeRooms(db, booking, from, to),
    };
  },

  async extend(db: Db, user: AuthenticatedUser, request: ExtendRequest) {
    const booking = await loadBooking(db, user, request.id);
    const { from, to, added } = window(booking, request.newCheckOut);

    const requested = Array.isArray(request.rooms) ? request.rooms.slice(0, MAX_ROOMS) : [];
    const picked = Array.from(new Set(requested.map((entry) => String(entry?.id ?? "")).filter(Boolean)));
    if (picked.length === 0) throw new HttpError(400, "Choose at least one room for the extra nights.");

    const free = await freeRooms(db, booking, from, to);
    const freeById = new Map(free.map((room) => [room.id, room]));
    const additions: StaySegment[] = picked.map((roomId) => {
      const room = freeById.get(roomId);
      if (!room) throw new HttpError(409, "One of the rooms is not free for those nights. Refresh and choose again.");
      const entry = requested.find((candidate) => String(candidate?.id) === roomId);
      let rate = room.rate;
      if (entry?.rate !== undefined && entry.rate !== null && entry.rate !== "") {
        const custom = money(Number(entry.rate));
        if (!Number.isFinite(custom) || custom < 0) throw new HttpError(400, "A room rate must be zero or more.");
        // The price list sets the rate. Only an administrator may give a different one, such as a discount.
        if (Math.abs(custom - rate) > 0.009) {
          assertAdmin(user, "change the room rate");
          rate = custom;
        }
      }
      return {
        room_id: roomId,
        code: room.code,
        type: room.category,
        from,
        to,
        nights: added,
        rate,
        amount: money(rate * added),
        kind: "EXTENSION" as const,
      };
    });

    const roomsById = new Map((await loadRooms(db, booking.outlet_id)).map((room) => [String(room._id), room as Record<string, any>]));
    const existing = staySegments(booking);
    const segments = [...(existing.length > 0 ? existing : legacySegments(booking, roomsById)), ...additions];
    const total = money(segments.reduce((sum, segment) => sum + segment.amount, 0));

    const now = new Date();
    const roomIds = Array.from(new Set([...assignedRoomIds(booking), ...picked]));
    const details = booking.checkin_details && typeof booking.checkin_details === "object" ? booking.checkin_details : {};
    const knownRooms: any[] = Array.isArray(details.assigned_rooms) ? details.assigned_rooms : [];
    const assignedRooms = [
      ...knownRooms,
      ...additions
        .filter((segment) => !knownRooms.some((room) => String(room?.id ?? room?.room_id) === segment.room_id))
        .map((segment) => ({ id: segment.room_id, code: segment.code, type: segment.type, room_type: segment.type, assigned_at: now.toISOString() })),
    ];

    const result = await db.collection("bookings").updateOne(
      // Only if nobody else changed the stay in the meantime.
      { _id: booking._id, status: "CHECKED_IN", check_out_date: booking.check_out_date },
      {
        $set: {
          check_out_date: to,
          nights: nightsBetween(new Date(booking.check_in_date), to),
          stay_segments: segments,
          total_amount: total,
          room_total: total,
          room_ids: roomIds,
          checkin_details: { ...details, assigned_rooms: assignedRooms },
          updated_at: now,
        },
        $push: {
          extensions: {
            at: now,
            by: { id: user.id, name: user.name },
            from_check_out: from,
            to_check_out: to,
            rooms: additions.map((segment) => ({ room_id: segment.room_id, code: segment.code, rate: segment.rate })),
          },
        } as any,
      },
    );
    if (!result.matchedCount) throw new HttpError(409, "This stay was just changed by someone else. Refresh and try again.");
    return db.collection("bookings").findOne({ _id: booking._id });
  },

  /** An administrator's change to one room line's nightly rate, such as a discount. */
  async updateRate(db: Db, user: AuthenticatedUser, request: ExtendRequest) {
    assertAdmin(user, "change the room rate");
    const booking = await loadBooking(db, user, request.id);
    if (String(booking.status).toUpperCase() === "CHECKED_OUT") throw new HttpError(409, "A checked-out stay cannot be changed.");
    const segments = [...staySegments(booking)];
    const index = Number(request.segmentIndex);
    const rate = money(Number(request.rate));
    if (!Number.isInteger(index) || !segments[index]) throw new HttpError(400, "Choose a room line.");
    if (!Number.isFinite(rate) || rate < 0) throw new HttpError(400, "A room rate must be zero or more.");

    segments[index] = { ...segments[index], rate, amount: money(rate * segments[index].nights) };
    const total = money(segments.reduce((sum, segment) => sum + segment.amount, 0));
    await db.collection("bookings").updateOne(
      { _id: booking._id },
      { $set: { stay_segments: segments, total_amount: total, room_total: total, updated_at: new Date() } },
    );
    return db.collection("bookings").findOne({ _id: booking._id });
  },

  /** Turns a never-changed stay into room lines so an administrator can set a rate on each, without extending. */
  async splitIntoLines(db: Db, user: AuthenticatedUser, request: ExtendRequest) {
    assertAdmin(user, "change the room rate");
    const booking = await loadBooking(db, user, request.id);
    if (staySegments(booking).length > 0) return booking;
    if (String(booking.status).toUpperCase() === "CHECKED_OUT") throw new HttpError(409, "A checked-out stay cannot be changed.");
    const roomsById = new Map((await loadRooms(db, booking.outlet_id)).map((room) => [String(room._id), room as Record<string, any>]));
    const segments = legacySegments(booking, roomsById);
    await db.collection("bookings").updateOne({ _id: booking._id }, { $set: { stay_segments: segments, updated_at: new Date() } });
    return db.collection("bookings").findOne({ _id: booking._id });
  },
};

