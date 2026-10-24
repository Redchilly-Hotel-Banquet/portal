import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isGoogleAuthEnabled } from "@/server/env";
import {
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  appOrigin,
  completeUrl,
  redirectUri,
  safeNext,
} from "@/server/google";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (!isGoogleAuthEnabled()) {
    return NextResponse.redirect(completeUrl(appOrigin(request), { error: "google_disabled", next }));
  }

  const state = randomBytes(24).toString("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/auth/google",
    maxAge: 600,
  };
  response.cookies.set(GOOGLE_STATE_COOKIE, state, cookie);
  response.cookies.set(GOOGLE_NEXT_COOKIE, next, cookie);
  return response;
}
