import { route } from "@/server/route";
import { userService } from "@/server/modules/users/user.service";

export const dynamic = "force-dynamic";

/** GET returns the signed-in user's profile; POST updates their name and phone. */
export const GET = route(async ({ user }) => ({ profile: await userService.getProfile(user!) }), {
  authenticated: true,
});

export const POST = route(async ({ user, body }) => ({ profile: await userService.updateProfile(user!, body) }), {
  authenticated: true,
});
