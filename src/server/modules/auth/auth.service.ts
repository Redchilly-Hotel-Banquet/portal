import { Document, ObjectId } from "mongodb";
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
  // Branches are stored as ids (or "all"); the session carries them as text and they are turned into branch keys on each request.
  outlets: parseList(Array.isArray(doc.outlets) ? doc.outlets.map((entry: unknown) => stringifyId(entry) ?? "") : doc.outlets, "all", false),
});

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

    if (!userDoc) throw new HttpError(401, "Invalid credentials");

    // An account without a password of its own cannot be opened with a username and password.
    const stored = typeof userDoc.adminPassword === "string" && userDoc.adminPassword ? userDoc.adminPassword : null;
    if (!stored || !verifyPassword(password, stored)) {
      throw new HttpError(401, "Invalid credentials");
    }
    // Older accounts keep their password as plain text; encrypt it from the first successful login.
    if (isPlain(stored)) {
      await mongoConnection.getDb().collection("configs").updateOne({ _id: userDoc._id }, { $set: { adminPassword: storePassword(password) } });
    }
    return await issueToken(buildUser(userDoc));
  }
};
