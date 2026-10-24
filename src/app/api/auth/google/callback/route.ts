import { NextResponse } from "next/server";
import { HttpError } from "@/server/httpError";
import { isGoogleAuthEnabled } from "@/server/env";
import {
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  appOrigin,
  completeUrl,
  exchangeCode,
  readCookie,
  safeNext,
} from "@/server/google";
import { mongoConnection } from "@/server/mongo";
import { userService } from "@/server/modules/users/user.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const next = safeNext(decodeURIComponent(readCookie(request, GOOGLE_NEXT_COOKIE) ?? ""));

  const finish = (params: Record<string, string>) => {
    const response = NextResponse.redirect(completeUrl(origin, { ...params, next }));
    response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: "/api/auth/google" });
    response.cookies.delete({ name: GOOGLE_NEXT_COOKIE, path: "/api/auth/google" });
    return response;
  };

  if (!isGoogleAuthEnabled()) return finish({ error: "google_disabled" });

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !state || state !== readCookie(request, GOOGLE_STATE_COOKIE)) {
    return finish({ error: "google_cancelled" });
  }

  try {
    const profile = await exchangeCode(code, request);
    if (!profile.emailVerified) return finish({ error: "google_unverified" });
    await mongoConnection.connect();
    const session = await userService.signInWithGoogle(profile);
    return finish({ session: Buffer.from(JSON.stringify(session)).toString("base64url") });
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 403) return finish({ error: "account_inactive" });
    console.error("[auth] google sign-in failed", error);
    // The reason is only shown during development; production users get the generic message.
    const detail = process.env.NODE_ENV === "production" ? {} : { detail: error instanceof Error ? error.message : String(error) };
    return finish({ error: "google_failed", ...detail });
  }
}
