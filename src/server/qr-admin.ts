import { route } from "./route";
import { HttpError } from "./httpError";

// QR campaigns and customer history are shared across all branches.
export const authorizeQrAdmin = route(async ({ user }) => {
  if (!user!.outlets.includes("all")) throw new HttpError(403, "An administrator with access to all branches is required to manage shared QR campaigns.");
  return { authorized: true };
}, { roles: ["admin"] });
