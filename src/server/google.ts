import { env } from "./env";

export const GOOGLE_STATE_COOKIE = "rc_google_state";
export const GOOGLE_NEXT_COOKIE = "rc_google_next";

/** Only same-site absolute paths are allowed as post-login destinations. */
export const safeNext = (value: string | null | undefined): string =>
  value && /^\/(?!\/)[^\\\s]*$/.test(value) ? value : "/";

export const completeUrl = (origin: string, params: Record<string, string>) =>
  `${origin}/auth/complete#${new URLSearchParams(params)}`;

export const readCookie = (request: Request, name: string) =>
  request.headers
    .get("cookie")
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

export const appOrigin = (request: Request) => env.APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin;

export const redirectUri = (request: Request) => `${appOrigin(request)}/api/auth/google/callback`;

type GoogleProfile = { email: string; name?: string; picture?: string; emailVerified: boolean };

export const exchangeCode = async (code: string, request: Request): Promise<GoogleProfile> => {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    const reason = (await tokenResponse.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    throw new Error(`Google token exchange failed: ${reason?.error ?? tokenResponse.status}${reason?.error_description ? ` (${reason.error_description})` : ""}`);
  }
  const { access_token } = (await tokenResponse.json()) as { access_token?: string };
  if (!access_token) throw new Error("Google did not return an access token");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileResponse.ok) throw new Error("Could not read Google profile");
  const profile = (await profileResponse.json()) as {
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  if (!profile.email) throw new Error("Google account has no email");
  return { email: profile.email, name: profile.name, picture: profile.picture, emailVerified: Boolean(profile.email_verified) };
};
