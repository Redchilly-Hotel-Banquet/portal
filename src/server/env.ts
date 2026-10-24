import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  MONGO_DB_URI: z.string().min(1, "MONGO_DB_URI is required"),
  MONGO_DB_NAME: z.string().min(1, "MONGO_DB_NAME is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  TOKEN_EXPIRES_IN: z.string().default("12h"),
  ADMIN_DEFAULT_PASSWORD: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ADMIN_GOOGLE_EMAILS: z.string().optional(),
  APP_URL: z.string().optional(),
  PROFILE_ENCRYPTION_KEY: z.string().min(16).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

// Parsed on first use so `next build` succeeds without secrets present.
const load = (): Env => {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    throw new Error(`Invalid server environment: ${fields}`);
  }
  cached = parsed.data;
  return cached;
};

export const env = new Proxy({} as Env, {
  get: (_target, key: string) => load()[key as keyof Env],
});

export const isGoogleAuthEnabled = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
