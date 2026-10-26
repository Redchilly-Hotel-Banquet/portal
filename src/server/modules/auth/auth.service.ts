import { timingSafeEqual } from "node:crypto";
import { Document } from "mongodb";
import { env } from "../../env";
import { mongoConnection } from "../../mongo";
import { HttpError } from "../../httpError";
import { signSession } from "../../session";
import { stringifyId } from "../../utils/objectId";
import { resolveOutlets } from "../../utils/access";
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
    const usedFallback = Boolean(fallback) && safeEqual(password, fallback!);

    if (!userDoc) {
      if (usedFallback) {
        return await issueToken({ id: "default-admin", name: "Admin", roles: ["admin"], outlets: ["all"] });
      }
      throw new HttpError(401, "Invalid credentials");
    }

    const stored = typeof userDoc.adminPassword === "string" ? userDoc.adminPassword : fallback;
    if (!usedFallback && !(stored && safeEqual(password, stored))) {
      throw new HttpError(401, "Invalid credentials");
    }
    return await issueToken(buildUser(userDoc));
  }
};
