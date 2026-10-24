import { route } from "@/server/route";
import { userService } from "@/server/modules/users/user.service";

export const dynamic = "force-dynamic";

/** The guest's checked-in room(s), so they can order without scanning a QR code. */
export const GET = route(async ({ user }) => ({ stay: await userService.getActiveStay(user!) }), {
  authenticated: true,
});
