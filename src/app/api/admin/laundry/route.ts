import { route } from "@/server/route";
import { laundryService } from "@/server/modules/laundry/laundry.service";

// Administrators and staff given the Laundry role record laundry sent out and received back, and settle it.
export const POST = route(({ body, user }) => laundryService.handle(body, user!), { roles: ["admin", "laundry"] });
