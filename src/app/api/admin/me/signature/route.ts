import { route } from "@/server/route";
import { staffSignatureService } from "@/server/modules/staff/staff-signature.service";

// Any staff member keeps their own signature; it is never taken from or sent for anyone else.
export const POST = route(({ body, user }) => staffSignatureService.handle(body, user!), {
  roles: ["admin", "rooms", "kitchen", "loyalty", "laundry"],
});
