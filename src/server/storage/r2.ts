import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";
import { HttpError } from "../httpError";

const globalCache = globalThis as unknown as { __redchillyR2?: S3Client };

const client = (): S3Client => {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !env.R2_BUCKET) {
    throw new HttpError(503, "File storage is not configured");
  }
  return (globalCache.__redchillyR2 ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  }));
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Splits a base64 image data URL. Only formats the app produces are accepted. */
export const parseImageDataUrl = (value: string) => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new HttpError(400, "Images must be JPG, PNG or WebP");
  return { mimeType: match[1], extension: EXTENSIONS[match[1]], bytes: Buffer.from(match[2], "base64") };
};

export const r2 = {
  async put(key: string, bytes: Buffer, contentType: string) {
    await client().send(
      new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: bytes, ContentType: contentType }),
    );
  },

  /** Returns null when the object is missing, so one lost file never breaks a whole booking. */
  async getDataUrl(key: string): Promise<string | null> {
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      if (!res.Body) return null;
      const bytes = Buffer.from(await res.Body.transformToByteArray());
      return `data:${res.ContentType || "image/jpeg"};base64,${bytes.toString("base64")}`;
    } catch (error) {
      console.error("[r2] could not read", key, error);
      return null;
    }
  },

  /** The raw bytes of an object, or null when it is missing. */
  async getBytes(key: string): Promise<Buffer | null> {
    try {
      const res = await client().send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
      return res.Body ? Buffer.from(await res.Body.transformToByteArray()) : null;
    } catch (error) {
      console.error("[r2] could not read", key, error);
      return null;
    }
  },

  async remove(key: string) {
    try {
      await client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    } catch (error) {
      console.error("[r2] could not delete", key, error);
    }
  },

  /** Public URL for an object; only meant for Menu/ images. */
  publicUrl(key: string) {
    const base = (env.MEDIA_BASE_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new HttpError(503, "File storage is not configured");
    return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`;
  },

  /** Inverse of publicUrl, or null for any URL that is not a Menu/ object of ours (so nothing else can be deleted through it). */
  keyFromPublicUrl(url: unknown): string | null {
    const base = (env.MEDIA_BASE_URL ?? "").replace(/\/+$/, "");
    if (typeof url !== "string" || !base || !url.startsWith(`${base}/`)) return null;
    try {
      const key = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]);
      return key.startsWith("Menu/") ? key : null;
    } catch {
      return null;
    }
  },
};
