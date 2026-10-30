import { ObjectId } from "mongodb";
import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { USERS_COLLECTION, STAFF_ROLES, userService } from "../users/user.service";
import { stringifyId } from "../../utils/objectId";
import { tenDigitPhone } from "../../../lib/phone";
import { phonePattern } from "../users/user.service";
import { isSuperOwnerEmail } from "../../../lib/super-owner";
import { revealPassword, storePassword } from "../../utils/password";

type AccessRequest = {
  action?: "users_search" | "user_info" | "guest_info" | "user_update" | "logins_list" | "login_create" | "login_update" | "login_reveal" | "login_delete" | "switch_account";
  q?: string;
  /** switch_account: the account to switch into. */
  email?: string;
  /** guest_info: who to look up, as returned by the search ("p:<10 digits>", "e:<email>" or "n:<name>"). */
  key?: string;
  id?: string;
  name?: string;
  password?: string;
  roles?: unknown;
  outlets?: unknown;
  isActive?: boolean;
};

/** Accounts that never appear in the access list, not even when searched for. */
const HIDDEN_EMAILS = ["thesatemail@gmail.com", "donthavetheemail@gmail", "donthavetheemail@gmail.com"];
const isHiddenEmail = (value: unknown) => HIDDEN_EMAILS.includes(String(value ?? "").trim().toLowerCase());

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toLowerCase();

const objectId = (value: unknown): ObjectId => {
  try {
    return new ObjectId(String(value));
  } catch {
    throw new HttpError(400, "Invalid account id");
  }
};

const cleanRoles = (raw: unknown): string[] => {
  const values = Array.isArray(raw) ? raw : [];
  const roles = Array.from(new Set(values.map((value) => String(value).trim().toLowerCase())));
  const bad = roles.find((role) => !(STAFF_ROLES as readonly string[]).includes(role));
  if (bad) throw new HttpError(400, `"${bad}" is not a role.`);
  return roles;
};

/** Branches by their real keys (matched ignoring case and spaces). "all" means every branch. */
const cleanOutlets = async (raw: unknown, roles: string[]): Promise<string[]> => {
  const values = (Array.isArray(raw) ? raw : []).map((value) => String(value).trim()).filter(Boolean);
  if (values.some((value) => norm(value) === "all")) return ["all"];
  const keys = (await mongoConnection.getDb().collection("outlets").find({}, { projection: { location_key: 1 } }).toArray()).map((doc) =>
    String(doc.location_key ?? ""),
  );
  const resolved = values.map((value) => {
    const key = keys.find((candidate) => norm(candidate) === norm(value));
    if (!key) throw new HttpError(400, `"${value}" is not a branch.`);
    return key;
  });
  if (roles.length > 0 && resolved.length === 0) throw new HttpError(400, "Choose at least one branch, or All branches.");
  return Array.from(new Set(resolved));
};

const db = () => mongoConnection.getDb();

/** Active administrators other than `exceptId`, across staff logins and Google accounts. */
const otherActiveAdmins = async (exceptId: string) => {
  const [logins, accounts] = await Promise.all([
    db().collection("configs").find({ purpose: "admin", isActive: { $ne: false } }, { projection: { _id: 1 } }).toArray(),
    db().collection(USERS_COLLECTION).find({ roles: "admin", isActive: { $ne: false } }, { projection: { _id: 1 } }).toArray(),
  ]);
  return [...logins, ...accounts].filter((doc) => String(doc._id) !== exceptId).length;
};

/** Stops an edit that would lock everyone out of administration, or take away the caller's own access. */
const assertSafeAdminChange = async (caller: AuthenticatedUser, targetId: string, willBeAdmin: boolean, willBeActive: boolean) => {
  if (willBeAdmin && willBeActive) return;
  if (caller.id === targetId) throw new HttpError(409, "You cannot remove your own administrator access or deactivate your own account.");
  if ((await otherActiveAdmins(targetId)) < 1) throw new HttpError(409, "At least one active administrator must remain.");
};

const presentUser = (doc: Record<string, any>) => ({
  id: stringifyId(doc._id) ?? "",
  email: doc.email ?? "",
  name: doc.name ?? "",
  picture: doc.picture ?? null,
  roles: Array.isArray(doc.roles) ? doc.roles : [],
  outlets: Array.isArray(doc.outlets) ? doc.outlets : [],
  isActive: doc.isActive !== false,
});

const presentLogin = (doc: Record<string, any>) => ({
  id: stringifyId(doc._id) ?? "",
  name: doc.name ?? "",
  roles: Array.isArray(doc.purpose) ? doc.purpose : [],
  outlets: Array.isArray(doc.outlets) ? doc.outlets : [],
  isActive: doc.isActive !== false,
  hasPassword: typeof doc.adminPassword === "string" && doc.adminPassword.length > 0,
  passwordUpdatedAt: doc.password_updated_at ?? null,
});

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * How a guest has used the hotel: stays, spend, food and how they paid. Matched the way the guest's own account
 * does it (bookings made while signed in, plus bookings under their verified email). Identity documents and
 * signatures are never part of this.
 */
const userInfo = async (id: ObjectId) => {
  const account = await db().collection(USERS_COLLECTION).findOne({ _id: id });
  if (!account) throw new HttpError(404, "Account not found");
  const email = String(account.email ?? "").trim();
  const matches: Record<string, unknown>[] = [{ user_id: String(id) }, { linked_user_ids: String(id) }];
  if (email) matches.push({ guest_email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } });
  return analyticsFor({ $or: matches }, presentUser(account), account.createdAt ?? account.created_at ?? null);
};

/** The same figures for someone who has only ever booked, without a Google account. */
const guestInfo = async (key: string) => {
  const kind = key.slice(0, 2);
  const value = key.slice(2);
  let filter: Record<string, unknown>;
  let header: { name: string; phone: string; email: string };
  if (kind === "p:" && /^\d{10}$/.test(value)) {
    filter = { guest_phone: { $regex: phonePattern(value) } };
    header = { name: "", phone: value, email: "" };
  } else if (kind === "e:" && value) {
    filter = { guest_email: { $regex: `^${escapeRegex(value)}$`, $options: "i" } };
    header = { name: "", phone: "", email: value };
  } else if (kind === "n:" && value) {
    filter = { guest_name: { $regex: `^${escapeRegex(value)}$`, $options: "i" } };
    header = { name: value, phone: "", email: "" };
  } else {
    throw new HttpError(400, "Choose a guest from the search results.");
  }
  const first = await db().collection("bookings").find(filter).sort({ created_at: -1 }).limit(1).toArray();
  if (first.length === 0) throw new HttpError(404, "No bookings found for this guest.");
  const latest = first[0] as Record<string, any>;
  return analyticsFor(
    filter,
    { id: key, name: String(latest.guest_name ?? header.name), email: String(latest.guest_email ?? header.email), phone: String(latest.guest_phone ?? header.phone), roles: [], isActive: true, hasAccount: false },
    null,
  );
};

const analyticsFor = async (bookingFilter: Record<string, unknown>, who: Record<string, unknown>, since: unknown) => {
  const bookings = await db()
    .collection("bookings")
    .find(bookingFilter)
    .project({ booking_code: 1, outlet_id: 1, status: 1, check_in_date: 1, check_out_date: 1, nights: 1, number_of_guests: 1, total_amount: 1, folio_total: 1, food_total: 1, payments: 1, gst: 1, created_at: 1, "checkin_details.assigned_rooms": 1 })
    .sort({ check_in_date: -1 })
    .toArray();

  const outletNames = new Map<string, string>();
  for (const outlet of await db().collection("outlets").find({}).project({ location_key: 1, name: 1 }).toArray()) {
    if (outlet.location_key) outletNames.set(String(outlet.location_key), String(outlet.name ?? outlet.location_key));
  }

  const byStatus: Record<string, number> = {};
  const branches = new Map<string, number>();
  const payments: Record<string, number> = {};
  let nights = 0;
  let billed = 0;
  let gst = 0;
  let upcomingValue = 0;
  const stays: Array<{ checkIn: Date; checkOut: Date }> = [];
  for (const booking of bookings) {
    const status = String(booking.status ?? "CONFIRMED").toUpperCase().replace("PENDING", "CONFIRMED");
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const branch = outletNames.get(String(booking.outlet_id)) ?? String(booking.outlet_id ?? "");
    if (status !== "CANCELLED") branches.set(branch, (branches.get(branch) ?? 0) + 1);
    if (status === "CHECKED_OUT") {
      nights += num(booking.nights);
      billed += num(booking.folio_total) || num(booking.total_amount);
      gst += num(booking.gst?.gst);
      for (const payment of Array.isArray(booking.payments) ? booking.payments : []) {
        const mode = String(payment?.mode ?? "OTHER");
        payments[mode] = (payments[mode] ?? 0) + num(payment?.amount);
      }
      if (booking.check_in_date && booking.check_out_date) stays.push({ checkIn: new Date(booking.check_in_date), checkOut: new Date(booking.check_out_date) });
    } else if (status === "CHECKED_IN") {
      nights += num(booking.nights);
    } else if (status === "CONFIRMED") {
      upcomingValue += num(booking.total_amount);
    }
  }

  // Food ordered to their rooms during those stays.
  const bookingIds = bookings.map((booking) => String(booking._id));
  const orders = bookingIds.length
    ? await db().collection("orders").find({ booking_id: { $in: bookingIds }, status: { $in: ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED", "ORDER_FINISHED"] } }).toArray()
    : [];
  const orderIds = orders.map((order) => String(order._id));
  const lines = orderIds.length ? await db().collection("order_items").find({ order_id: { $in: orderIds } }).toArray() : [];
  const dishCounts = new Map<string, number>();
  for (const line of lines) dishCounts.set(String(line.menu_item_id), (dishCounts.get(String(line.menu_item_id)) ?? 0) + num(line.quantity));
  const topIds = Array.from(dishCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const menuDocs = topIds.length
    ? await db()
        .collection("menu_items")
        .find({ _id: { $in: topIds.flatMap(([key]) => { try { return [key, new ObjectId(key)]; } catch { return [key]; } }) } as any }, { projection: { name: 1 } })
        .toArray()
    : [];
  const dishNames = new Map(menuDocs.map((doc) => [String(doc._id), String(doc.name ?? "")]));

  const finished = stays.sort((a, b) => b.checkOut.getTime() - a.checkOut.getTime());
  return {
    user: who,
    since,
    stays: {
      bookings: bookings.length,
      byStatus,
      nights,
      completed: byStatus.CHECKED_OUT ?? 0,
      averageNights: stays.length ? money(stays.reduce((sum, stay) => sum + (stay.checkOut.getTime() - stay.checkIn.getTime()) / 86_400_000, 0) / stays.length) : 0,
      lastStay: finished[0]?.checkOut ?? null,
      branches: Array.from(branches.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    },
    spend: { billed: money(billed), gst: money(gst), upcomingValue: money(upcomingValue), payments },
    food: {
      orders: orders.length,
      total: money(orders.reduce((sum, order) => sum + (num(order.total) || num(order.subtotal)), 0)),
      topDishes: topIds.map(([key, count]) => ({ name: dishNames.get(key) || "Dish no longer on the menu", count })),
    },
    recent: bookings.slice(0, 10).map((booking) => ({
      id: stringifyId(booking._id) ?? "",
      code: booking.booking_code ?? "",
      branch: outletNames.get(String(booking.outlet_id)) ?? String(booking.outlet_id ?? ""),
      status: String(booking.status ?? ""),
      checkIn: booking.check_in_date ?? null,
      checkOut: booking.check_out_date ?? null,
      nights: num(booking.nights),
      amount: String(booking.status).toUpperCase() === "CHECKED_OUT" ? num(booking.folio_total) || num(booking.total_amount) : num(booking.total_amount),
      rooms: ((booking.checkin_details?.assigned_rooms ?? []) as Array<{ code?: string }>).map((room) => String(room?.code ?? "")).filter(Boolean),
    })),
  };
};

/**
 * Who may sign in and what they can do: Google accounts (roles and branches assigned by search) and the
 * username-and-password staff logins. Only all-branch administrators manage access. Passwords are never returned.
 */
export const accessService = {
  async handle(request: AccessRequest, user: AuthenticatedUser) {
    if (!user.roles.includes("admin") || !user.outlets.includes("all")) {
      throw new HttpError(403, "Only an all-branch administrator can manage access.");
    }
    switch (request?.action) {
      case "users_search": {
        const q = String(request.q ?? "").trim().slice(0, 80);
        // Without a search, only people who already have staff access are listed. Everyone else (there can be
        // thousands) appears only when searched for.
        if (q.length < 2) {
          const staff = await db().collection(USERS_COLLECTION).find({ "roles.0": { $exists: true }, email: { $nin: HIDDEN_EMAILS } }).sort({ email: 1 }).limit(200).toArray();
          return { users: staff.map(presentUser), guests: [], more: false, staffOnly: true };
        }
        const digits = q.replace(/\D/g, "");
        const phoneSearch = digits.length >= 4;
        const textFilters: Record<string, unknown>[] = [{ email: { $regex: escapeRegex(q), $options: "i" } }, { name: { $regex: escapeRegex(q), $options: "i" } }];
        if (phoneSearch) textFilters.push({ phone: { $regex: digits.split("").join("\\D*") } });
        const docs = await db().collection(USERS_COLLECTION).find({ $or: textFilters, email: { $nin: HIDDEN_EMAILS } }).sort({ email: 1 }).limit(26).toArray();

        // People who only ever booked (never signed in with Google), found by name, phone or email on their bookings.
        const bookingFilters: Record<string, unknown>[] = [{ guest_name: { $regex: escapeRegex(q), $options: "i" } }, { guest_email: { $regex: escapeRegex(q), $options: "i" } }];
        if (phoneSearch) bookingFilters.push({ guest_phone: { $regex: digits.split("").join("\\D*") } });
        const bookingDocs = await db()
          .collection("bookings")
          .find({ $or: bookingFilters, $and: [{ $or: [{ user_id: { $exists: false } }, { user_id: null }, { user_id: "" }] }] })
          .project({ guest_name: 1, guest_phone: 1, guest_email: 1, check_out_date: 1, created_at: 1 })
          .sort({ created_at: -1 })
          .limit(300)
          .toArray();
        const accountEmails = new Set(
          (await db().collection(USERS_COLLECTION).find({ email: { $in: bookingDocs.map((b) => String(b.guest_email ?? "").toLowerCase()).filter(Boolean) } }, { projection: { email: 1 } }).toArray()).map((u) =>
            String(u.email).toLowerCase(),
          ),
        );
        const groups = new Map<string, { key: string; name: string; phone: string; email: string; bookings: number; lastBooked: unknown }>();
        for (const booking of bookingDocs) {
          const email = String(booking.guest_email ?? "").trim().toLowerCase();
          if (email && accountEmails.has(email)) continue; // already an account: found above
          if (isHiddenEmail(email)) continue;
          const ten = tenDigitPhone(booking.guest_phone);
          const key = ten ? `p:${ten}` : email ? `e:${email}` : `n:${String(booking.guest_name ?? "").trim().toLowerCase()}`;
          if (key === "n:") continue;
          const group = groups.get(key) ?? { key, name: String(booking.guest_name ?? ""), phone: ten ?? String(booking.guest_phone ?? ""), email, bookings: 0, lastBooked: booking.created_at ?? null };
          group.bookings += 1;
          if (!group.email && email) group.email = email;
          groups.set(key, group);
        }
        const guests = Array.from(groups.values()).slice(0, 25);
        return { users: docs.slice(0, 25).map(presentUser), guests, more: docs.length > 25, staffOnly: false };
      }

      case "switch_account": {
        // Only the super-owner's own signed-in Google session may do this; a switched session cannot switch again.
        if (user.src !== "user" || !isSuperOwnerEmail(user.email)) throw new HttpError(403, "Only the super-owner can switch accounts.");
        return userService.sessionForEmail(String(request.email ?? ""));
      }

      case "user_info":
        return userInfo(objectId(request.id));

      case "guest_info":
        return guestInfo(String(request.key ?? ""));

      case "user_update": {
        const id = objectId(request.id);
        const target = await db().collection(USERS_COLLECTION).findOne({ _id: id });
        if (!target) throw new HttpError(404, "Account not found");
        const roles = cleanRoles(request.roles ?? target.roles);
        const outlets = roles.length > 0 ? await cleanOutlets(request.outlets ?? target.outlets, roles) : [];
        const isActive = request.isActive ?? target.isActive !== false;
        await assertSafeAdminChange(user, String(id), roles.includes("admin"), isActive);
        await db().collection(USERS_COLLECTION).updateOne({ _id: id }, { $set: { roles, outlets: roles.length ? outlets : ["all"], isActive, updatedAt: new Date() } });
        return { user: presentUser((await db().collection(USERS_COLLECTION).findOne({ _id: id }))!) };
      }

      case "logins_list": {
        const docs = await db().collection("configs").find({}).sort({ name: 1 }).toArray();
        return { logins: docs.map(presentLogin) };
      }

      case "login_create": {
        const name = String(request.name ?? "").trim();
        if (name.length < 3 || name.length > 60) throw new HttpError(400, "The username must be 3 to 60 characters.");
        const password = String(request.password ?? "");
        if (password.length < 8) throw new HttpError(400, "The password must be at least 8 characters.");
        const roles = cleanRoles(request.roles);
        if (roles.length === 0) throw new HttpError(400, "Choose at least one role.");
        const outlets = await cleanOutlets(request.outlets, roles);
        const clash = await db().collection("configs").findOne({ name }, { collation: { locale: "en", strength: 2 } });
        if (clash) throw new HttpError(409, "A login with that username already exists.");
        const now = new Date();
        const result = await db().collection("configs").insertOne({
          name,
          adminPassword: storePassword(password),
          purpose: roles,
          outlets,
          isActive: true,
          created_at: now,
          password_updated_at: now,
        });
        return { login: presentLogin((await db().collection("configs").findOne({ _id: result.insertedId }))!) };
      }

      case "login_update": {
        const id = objectId(request.id);
        const target = await db().collection("configs").findOne({ _id: id });
        if (!target) throw new HttpError(404, "Login not found");
        const set: Record<string, unknown> = { updated_at: new Date() };

        if (request.name !== undefined) {
          const name = String(request.name).trim();
          if (name.length < 3 || name.length > 60) throw new HttpError(400, "The username must be 3 to 60 characters.");
          const clash = await db().collection("configs").findOne({ name, _id: { $ne: id } }, { collation: { locale: "en", strength: 2 } });
          if (clash) throw new HttpError(409, "A login with that username already exists.");
          set.name = name;
        }
        const roles = request.roles !== undefined ? cleanRoles(request.roles) : ((target.purpose as string[]) ?? []);
        if (roles.length === 0) throw new HttpError(400, "Choose at least one role.");
        set.purpose = roles;
        set.outlets = await cleanOutlets(request.outlets ?? target.outlets, roles);
        const isActive = request.isActive ?? target.isActive !== false;
        set.isActive = isActive;
        if (request.password !== undefined && request.password !== "") {
          if (String(request.password).length < 8) throw new HttpError(400, "The password must be at least 8 characters.");
          set.adminPassword = storePassword(String(request.password));
          set.password_updated_at = new Date();
        }
        await assertSafeAdminChange(user, String(id), roles.includes("admin"), isActive);
        await db().collection("configs").updateOne({ _id: id }, { $set: set });
        return { login: presentLogin((await db().collection("configs").findOne({ _id: id }))!) };
      }

      case "login_reveal": {
        const id = objectId(request.id);
        const target = await db().collection("configs").findOne({ _id: id });
        if (!target) throw new HttpError(404, "Login not found");
        const password = revealPassword(target.adminPassword);
        // A record of who looked, never of the password itself.
        console.info(`[access] ${user.name} (${user.id}) viewed the password of login "${target.name}"`);
        if (password === null) {
          throw new HttpError(409, target.adminPassword ? "This password cannot be shown. Set a new one." : "This login has no password of its own. The default password applies.");
        }
        return { password };
      }

      case "login_delete": {
        const id = objectId(request.id);
        const target = await db().collection("configs").findOne({ _id: id });
        if (!target) throw new HttpError(404, "Login not found");
        await assertSafeAdminChange(user, String(id), false, false);
        await db().collection("configs").deleteOne({ _id: id });
        return { success: true };
      }

      default:
        throw new HttpError(400, "Invalid action");
    }
  },
};
