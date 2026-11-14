import { ObjectId } from "mongodb";

type Doc = Record<string, any>;

const HEX = /^[0-9a-f]{24}$/i;
/** A 24-character hex id as an ObjectId; anything else (blank, null, odd text) is left as it was. */
const asId = (value: unknown): unknown => (value instanceof ObjectId ? value : typeof value === "string" && HEX.test(value) ? new ObjectId(value) : value);

const withId = (entry: unknown, key: string) => (entry && typeof entry === "object" ? { ...(entry as Doc), [key]: asId((entry as Doc)[key]) } : entry);

/** A staff member's {id, name} as stored: the id is the account's _id. */
export const whoRef = (who: { id?: unknown; name?: unknown }) => ({ id: asId(who.id), name: who.name });

/**
 * Rooms and people on a booking are stored by _id. Code that builds a booking update works with ids as text, so
 * this turns every room / person reference in the update into an ObjectId just before it is written.
 */
export const storeBookingRefs = <T extends Doc>(update: T): T => {
  const out: Doc = { ...update };
  if ("room_id" in out) out.room_id = asId(out.room_id);
  if (Array.isArray(out.room_ids)) out.room_ids = out.room_ids.map(asId);
  if (Array.isArray(out.rooms_allocated)) out.rooms_allocated = out.rooms_allocated.map((line: unknown) => withId(line, "room_id"));
  if (Array.isArray(out.stay_segments)) out.stay_segments = out.stay_segments.map((line: unknown) => withId(line, "room_id"));
  if (out.checkin_details && typeof out.checkin_details === "object") {
    const details: Doc = { ...out.checkin_details };
    if (Array.isArray(details.assigned_rooms)) details.assigned_rooms = details.assigned_rooms.map((room: unknown) => withId(room, "id"));
    if (details.assigned_room) details.assigned_room = withId(details.assigned_room, "id");
    out.checkin_details = details;
  }
  if (out.payment_received_by) out.payment_received_by = whoRef(out.payment_received_by);
  return out as T;
};

/** One entry of a booking's `extensions` list as stored. */
export const storeExtensionRef = <T extends Doc>(entry: T): T => ({
  ...entry,
  by: entry.by ? whoRef(entry.by) : entry.by,
  rooms: Array.isArray(entry.rooms) ? entry.rooms.map((room: unknown) => withId(room, "room_id")) : entry.rooms,
});
