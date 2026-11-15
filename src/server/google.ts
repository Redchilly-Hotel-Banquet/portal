import { env } from "./env";

export const GOOGLE_STATE_COOKIE = "rc_google_state";
export const GOOGLE_NEXT_COOKIE = "rc_google_next";
/** Set when sign-in was started from the Android app, which Google will not allow inside its own WebView. */
export const GOOGLE_APP_COOKIE = "rc_google_app";

/** Only same-site absolute paths are allowed as post-login destinations. */
export const safeNext = (value: string | null | undefined): string =>
  value && /^\/(?!\/)[^\\\s]*$/.test(value) ? value : "/";

export const completeUrl = (origin: string, params: Record<string, string>) =>
  `${origin}/auth/complete#${new URLSearchParams(params)}`;

/**
 * A page that hands the finished sign-in back to the Android app (Chrome cannot redirect straight to an app).
 * The tap on the button, or the automatic attempt, opens the app, which then loads the normal completion URL.
 * Without the app installed it carries on to the website.
 */
export const appHandoffHtml = (completion: string) => {
  const intent = `intent://open?u=${encodeURIComponent(completion)}#Intent;scheme=redchilly;package=in.redchilly.app;S.browser_fallback_url=${encodeURIComponent(completion)};end`;
  const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Red Chilly</title>
<style>body{font-family:system-ui,sans-serif;background:#faf8f4;color:#2a211b;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}a{display:inline-block;margin-top:20px;background:#9c2a1c;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600}</style></head>
<body><main><h1 style="font-size:20px">Signed in</h1><p>Return to the Red Chilly app to continue.</p>
<a href="${attr(intent)}">Open Red Chilly</a></main>
<script>setTimeout(function(){location.href=${JSON.stringify(intent).replace(/</g, "\\u003c")};},300);</script></body></html>`;
};

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
