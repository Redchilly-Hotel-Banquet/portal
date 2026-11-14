import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { scanReward } from "@/server/qr-redirect/scan.mjs";

// Staff with the Loyalty rewards role (and administrators) redeem a reward QR here, whatever the "anyone can scan" setting is.
export const POST = route(async ({ body, user }) => {
  try {
    return await scanReward(body, user!);
  } catch (error) {
    // The QR services share the same HTTP error contract.
    const status = (error as { statusCode?: number })?.statusCode;
    if (Number.isInteger(status)) throw new HttpError(status as number, (error as Error).message);
    throw error;
  }
}, { roles: ["admin", "loyalty"] });
