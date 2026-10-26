import { ObjectId } from "mongodb";
import { HttpError } from "../../httpError";
import { mongoConnection } from "../../mongo";
import type { AuthenticatedUser } from "../../session";
import { USERS_COLLECTION, STAFF_ROLES } from "../users/user.service";
import { stringifyId } from "../../utils/objectId";
import { revealPassword, storePassword } from "../../utils/password";

type AccessRequest = {
  action?: "users_search" | "user_update" | "logins_list" | "login_create" | "login_update" | "login_reveal" | "login_delete";
  q?: string;
  id?: string;
  name?: string;
  password?: string;
  roles?: unknown;
  outlets?: unknown;
  isActive?: boolean;
};

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
        // Accounts are only looked up on request; there can be thousands, so nothing is listed without a search.
        const q = String(request.q ?? "").trim().slice(0, 80);
        if (q.length < 2) return { users: [], more: false };
        const filter = { $or: [{ email: { $regex: escapeRegex(q), $options: "i" } }, { name: { $regex: escapeRegex(q), $options: "i" } }] };
        const docs = await db().collection(USERS_COLLECTION).find(filter).sort({ email: 1 }).limit(26).toArray();
        return { users: docs.slice(0, 25).map(presentUser), more: docs.length > 25 };
      }

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
