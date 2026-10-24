import { route } from "@/server/route";
import { userService } from "@/server/modules/users/user.service";

export const dynamic = "force-dynamic";

export const GET = route(({ user }) => userService.listBookings(user!), { authenticated: true });
