import { NextResponse } from "next/server";
import { HttpError } from "./httpError";
import { mongoConnection } from "./mongo";
import { userService } from "./modules/users/user.service";
import { AuthenticatedUser, assertRoles, readSession } from "./session";
import { resolveOutlets } from "./utils/access";

type Context = { body: any; user: AuthenticatedUser | null; request: Request };

type Options = {
  /** Roles allowed to call the endpoint. Omit for public endpoints. */
  roles?: string[];
  /** Any signed-in user (guest or staff) may call the endpoint. */
  authenticated?: boolean;
  /** Public endpoint that personalises the result when a valid token is sent. A bad token is ignored. */
  optionalAuth?: boolean;
  status?: number;
};

const readBody = async (request: Request) => {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
};

export const route =
  (handler: (ctx: Context) => Promise<unknown>, options: Options = {}) =>
  async (request: Request) => {
    try {
      const needsSession = Boolean(options.roles || options.authenticated);
      // Public endpoints ignore tokens (optionalAuth ones tolerate a bad one), so a stale token never breaks a guest.
      let user: AuthenticatedUser | null = null;
      if (needsSession) user = readSession(request);
      else if (options.optionalAuth) {
        try {
          user = readSession(request);
        } catch {
          user = null;
        }
      }
      if (needsSession && !user) throw new HttpError(401, "Missing or invalid authorization header");
      await mongoConnection.connect();
      if ((needsSession || user) && user?.src === "user") {
        // Roles come from the database, not the token, so changes and deactivation apply immediately.
        const access = await userService.getAccess(user.id);
        if (access) user = { ...user, ...access };
        else if (needsSession) throw new HttpError(401, "Account is no longer active");
        else user = null;
      }
      // Staff may only touch the branches they were given, matched to the real branch keys.
      if (needsSession && user) user = { ...user, outlets: await resolveOutlets(user.outlets) };
      if (options.roles) assertRoles(user!, options.roles);
      const body = await readBody(request);
      const result = await handler({ body, user, request });
      return NextResponse.json(result, { status: options.status ?? 200 });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.message, details: error.details },
          { status: error.statusCode },
        );
      }
      console.error("[api] unhandled error", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
