import jwt from "jsonwebtoken";
import { mongoConnection } from "../mongo";

/**
 * Push notifications to the staff phones through Firebase Cloud Messaging (HTTP v1).
 * Needs FIREBASE_SERVICE_ACCOUNT: the service-account key JSON from the Firebase project, as JSON or base64 of it.
 * Without it every call here does nothing and the app falls back to watching for orders itself.
 */
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let account: ServiceAccount | null | undefined;

const loadAccount = (): ServiceAccount | null => {
  if (account !== undefined) return account;
  account = null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return account;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(text) as ServiceAccount;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      account = { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
    }
  } catch {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }
  return account;
};

export const pushEnabled = (): boolean => loadAccount() !== null;

let cachedToken: { value: string; expires: number } | null = null;

const accessToken = async (sa: ServiceAccount): Promise<string> => {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    sa.private_key,
    { algorithm: "RS256" },
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !body.access_token) throw new Error(`Google token request failed (${response.status})`);
  cachedToken = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
};

const TOKENS = "push_tokens";

export type PushTokenDoc = { _id: string; user_id: string; roles: string[]; outlets: string[]; updated_at: Date };

const tokens = () => mongoConnection.getDb().collection<PushTokenDoc>(TOKENS);

export const registerPushToken = async (token: string, user: { id: string; roles: string[]; outlets: string[] }) => {
  await tokens().updateOne({ _id: token }, { $set: { user_id: String(user.id), roles: user.roles, outlets: user.outlets, updated_at: new Date() } }, { upsert: true });
};

export const unregisterPushToken = async (token: string, userId: string) => {
  await tokens().deleteOne({ _id: token, user_id: String(userId) });
};

/** Sends a data message to every phone whose account may see this branch's kitchen orders. */
export const pushToKitchen = async (outletKey: string | null, data: Record<string, string>): Promise<void> => {
  const sa = loadAccount();
  if (!sa) return;
  const recipients = await tokens()
    .find({ roles: { $in: ["admin", "kitchen"] }, $or: [{ outlets: "all" }, ...(outletKey ? [{ outlets: outletKey }] : [])] })
    .toArray();
  if (recipients.length === 0) return;
  const bearer = await accessToken(sa);
  await Promise.all(
    recipients.map(async (recipient) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: recipient._id, data, android: { priority: "HIGH", ttl: "300s" } } }),
      });
      // The app was uninstalled or the token expired: forget it.
      if (response.status === 404 || response.status === 400) {
        const detail = await response.text();
        if (/UNREGISTERED|INVALID_ARGUMENT/.test(detail)) await tokens().deleteOne({ _id: recipient._id });
        else console.error("[push] send failed", response.status, detail.slice(0, 200));
      } else if (!response.ok) {
        console.error("[push] send failed", response.status);
      }
    }),
  );
};
