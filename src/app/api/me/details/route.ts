import { route } from "@/server/route";
import { userService } from "@/server/modules/users/user.service";

export const dynamic = "force-dynamic";

/** GET returns the owner's saved ID details and signature (decrypted) for autofill. POST saves them. */
export const GET = route(({ user }) => userService.getSavedDetails(user!).then((details) => ({ details })), {
  authenticated: true,
});

export const POST = route(({ user, body }) => userService.saveDetails(user!, body).then((saved) => ({ saved })), {
  authenticated: true,
});
