import { route } from "@/server/route";
import { authService } from "@/server/modules/auth/auth.service";

export const POST = route(({ body }) => authService.login(body));
