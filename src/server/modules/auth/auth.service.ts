import { timingSafeEqual } from "node:crypto";
import { Document, ObjectId } from "mongodb";
import { env } from "../../env";
import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { signSession } from "../../session";
import { stringifyId } from "../../utils/objectId";
import { resolveOutlets } from "../../utils/access";
import { isPlain, storePassword, verifyPassword } from "../../utils/password";
import { AuthUser, LoginRequest, LoginResponse } from "./auth.types";

const parseList = (raw: unknown, fallback: string, lowercase: boolean): string[] => {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const cleaned = values
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean)
    .map((entry) => (lowercase ? entry.toLowerCase() : entry));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : [fallback];
};

const buildUser = (doc: Document): AuthUser => ({
  id: stringifyId(doc._id) ?? "unknown",
  name: typeof doc.name === "string" ? doc.name : "Admin",
  roles: parseList(doc.purpose, "admin", true),
  outlets: parseList(doc.outlets, "all", false),
});

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** The token carries the real branch keys, so the screens and the API agree on which branches an account may use. */
const issueToken = async (user: AuthUser): Promise<LoginResponse> => {
  const scoped = { ...user, outlets: await resolveOutlets(user.outlets) };
  return { token: signSession(scoped), user: scoped };
};

export const authService = {
  /** Current roles and branches of a username-and-password login, or null if it was removed or deactivated. */
  async getStaffAccess(id: string): Promise<{ roles: string[]; outlets: string[] } | null> {
    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return null;
    }
    const doc = await mongoConnection.getDb().collection("configs").findOne({ _id });
    if (!doc || doc.isActive === false) return null;
    const user = buildUser(doc);
    return { roles: user.roles, outlets: user.outlets };
  },

  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { userName, password } = payload ?? ({} as LoginRequest);
    if (!userName || !password) {
      throw new HttpError(400, "Username and password are required");
    }

    const userDoc = await mongoConnection
      .getDb()
      .collection("configs")
      .findOne({ name: userName, isActive: true }, { collation: { locale: "en", strength: 2 } });

    const fallback = env.ADMIN_DEFAULT_PASSWORD;

    if (!userDoc) {
      // Recovery login for an administrator who has locked themselves out of every account.
      if (Boolean(fallback) && safeEqual(password, fallback!)) {
        return await issueToken({ id: "default-admin", name: "Admin", roles: ["admin"], outlets: ["all"] });
      }
      throw new HttpError(401, "Invalid credentials");
    }

    // An account with its own password is only opened by that password. The default password is for accounts
    // that have none yet; it must never open an account that has one.
    const stored = typeof userDoc.adminPassword === "string" && userDoc.adminPassword ? userDoc.adminPassword : null;
    const ok = stored ? verifyPassword(password, stored) : Boolean(fallback) && safeEqual(password, fallback!);
    if (!ok) {
      throw new HttpError(401, "Invalid credentials");
    }
    // Older accounts keep their password as plain text; encrypt it from the first successful login.
    if (stored && isPlain(stored)) {
      await mongoConnection.getDb().collection("configs").updateOne({ _id: userDoc._id }, { $set: { adminPassword: storePassword(password) } });
    }
    return await issueToken(buildUser(userDoc));
  }
};
