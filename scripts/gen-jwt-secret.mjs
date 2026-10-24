import { randomBytes } from "node:crypto";

// Prints a fresh 256-bit secret. Paste it into JWT_SECRET (.env.local or Vercel).
console.log(randomBytes(32).toString("base64url"));
