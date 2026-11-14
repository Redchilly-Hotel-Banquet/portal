import { route } from "@/server/route";
import { HttpError } from "@/server/httpError";
import { usageService } from "@/server/modules/usage/usage.service";

// Storage figures cover the whole account, so only an all-branch administrator reads them.
export const POST = route(({ body, user }) => {
  if (!user?.outlets.includes("all")) throw new HttpError(403, "Only an all-branch administrator can view storage usage.");
  return usageService.handle(body);
}, { roles: ["admin"] });
