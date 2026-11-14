import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { manageQr } from "@/server/qr-redirect/management.mjs";

export const POST = route(async ({ body, request, user }) => {
  try {
    return await manageQr(body, request, user);
  } catch (error) {
    // Imported QR services share the same HTTP error contract.
    if (Number.isInteger(error?.statusCode)) throw new HttpError(error.statusCode, error.message);
    throw error;
  }
}, { roles: ["admin"] });
