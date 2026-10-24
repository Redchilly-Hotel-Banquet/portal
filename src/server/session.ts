import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "./env";
import { HttpError } from "./httpError";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email?: string;
  roles: string[];
  outlets: string[];
  /** "user" marks accounts from the users collection; their roles are re-read on every staff request. */
  src?: "user";
};

export const signSession = (user: AuthenticatedUser): string =>
  jwt.sign(user, env.JWT_SECRET, { expiresIn: env.TOKEN_EXPIRES_IN } as SignOptions);

export const readSession = (request: Request): AuthenticatedUser | null => {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthenticatedUser;
    return {
      id: payload.id,
      name: payload.name,
      email: payload.email,
      src: payload.src,
      roles: payload.roles ?? [],
      outlets: payload.outlets ?? [],
    };
  } catch {
    throw new HttpError(401, "Invalid token");
  }
};

export const assertRoles = (user: AuthenticatedUser, roles?: string[]) => {
  if (roles?.length && !user.roles.some((role) => roles.includes(role))) {
    throw new HttpError(403, "Insufficient permissions");
  }
};
