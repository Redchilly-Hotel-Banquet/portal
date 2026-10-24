// Repairs bookings whose loose room fields (room_id, room_ids, rooms_allocated) still point at a room
// that was un-ticked at check-in. The saved check-in room list (checkin_details.assigned_rooms) is the
// source of truth.
//
//   node --env-file=.env.local scripts/repair-room-assignments.mjs          # dry run, changes nothing
//   node --env-file=.env.local scripts/repair-room-assignments.mjs --apply  # writes, after saving a backup
//
// Orders placed to a room the booking no longer holds are moved to the room it does hold, but only when
// that is unambiguous (the booking holds exactly one room). Anything else is reported, not changed.
import { MongoClient } from "mongodb";
import { writeFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const client = new MongoClient(process.env.MONGO_DB_URI);
await client.connect();
const db = client.db(process.env.MONGO_DB_NAME);

const str = (value) => (value == null ? null : String(value));
const uniq = (values) => Array.from(new Set(values.filter(Boolean).map(String)));

const rooms = new Map((await db.collection("rooms_tables").find({}).project({ code: 1 }).toArray()).map((r) => [String(r._id), r.code]));
const label = (id) => rooms.get(String(id)) ?? String(id);

const bookings = await db
  .collection("bookings")
  .find({ status: { $in: ["CONFIRMED", "CHECKED_IN"] }, "checkin_details.assigned_rooms.0": { $exists: true } })
  .toArray();

const backups = { bookings: [], orders: [] };
const report = [];

for (const booking of bookings) {
  const expected = uniq(booking.checkin_details.assigned_rooms.map((r) => r.id ?? r._id ?? r.room_id));
  const loose = uniq([booking.room_id, ...(booking.room_ids ?? []), ...(booking.rooms_allocated ?? []).map((l) => l.room_id)]);
  const stale = loose.filter((id) => !expected.includes(id));
  const primaryWrong = str(booking.room_id) !== expected[0];
  if (stale.length === 0 && !primaryWrong) continue;

  const patch = {
    room_id: expected[0],
    room_ids: expected,
    rooms_allocated: (booking.rooms_allocated ?? []).map((line) =>
      line.room_id && !expected.includes(String(line.room_id)) ? { ...line, room_id: null, code: null, assigned_at: null } : line,
    ),
  };

  const orders = await db.collection("orders").find({ booking_id: String(booking._id), room_table_id: { $in: stale } }).toArray();
  const movable = expected.length === 1;
  report.push({
    booking: booking.booking_code,
    holds: expected.map(label),
    removing: stale.map(label),
    orders: orders.map((o) => `${o._id} ${o.status} was ${label(o.room_table_id)}${movable ? ` -> ${label(expected[0])}` : " (left as is: booking holds several rooms)"}`),
  });

  if (apply) {
    backups.bookings.push({ _id: booking._id, room_id: booking.room_id ?? null, room_ids: booking.room_ids ?? [], rooms_allocated: booking.rooms_allocated ?? [] });
    await db.collection("bookings").updateOne({ _id: booking._id }, { $set: patch });
    if (movable) {
      for (const order of orders) {
        backups.orders.push({ _id: order._id, room_table_id: order.room_table_id });
        await db.collection("orders").updateOne({ _id: order._id }, { $set: { room_table_id: expected[0] } });
      }
    }
  }
}

console.log(apply ? "APPLIED" : "DRY RUN (nothing changed)", `- ${report.length} booking(s) need repair`);
for (const r of report) console.log(JSON.stringify(r, null, 2));
if (apply && report.length) {
  const file = `room-repair-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(backups, null, 2));
  console.log("Backup of the previous values written to", file);
}
await client.close();
